import { RULES, COLORS, comebackDamage, localDay } from './config.mjs';
import { cellArea, cellCenter, approximateLocation, distance, overlap, validateRoute } from './geo.mjs';

// Supply IDs at the runtime boundary so the same rules run in Node and Android.
export function createGame(randomUUID) {
function emptyState() {
  return { version: 5, demoOffsetMs:0, players: {}, pools: {}, activities: {}, invites: {}, sessions: {}, events: [] };
}

function addPlayer(state, { id = String(randomUUID()), name = '跑者', color, kind = 'wechat' }, now) {
  if (state.players[id]) return state.players[id];
  const player = { id, name, color: color || COLORS[Object.keys(state.players).length % COLORS.length], kind, createdAt: now, poolId: null, lastPoolId: null, lastValidRunAt: null, lastFootprint: [], membershipFootprint: [], effects: {}, totalDistance: 0, runCount: 0, live: null, removedReason: null };
  state.players[id] = player;
  return player;
}

function event(state, entry, now) {
  state.events.push({ id: randomUUID(), time: now, ...entry });
  state.events = state.events.slice(-500);
}

function ownedCells(state, player) {
  const pool = state.pools[player.poolId];
  return pool ? Object.entries(pool.cells).filter(([, cell]) => cell.owner === player.id) : [];
}

function removePlayer(state, player, reason, now) {
  const pool = state.pools[player.poolId];
  if (!pool) return;
  for (const cell of Object.values(pool.cells)) if (cell.owner === player.id) { cell.owner = null; cell.fortification = 0; }
  pool.members = pool.members.filter(id => id !== player.id);
  event(state, { poolId: pool.id, type: 'removed', playerId: player.id, text: `${player.name}${reason === 'inactive' ? '久未跑步，已离开本池' : '领地被完全占领，将重新匹配'}` }, now);
  player.lastPoolId = pool.id;
  player.poolId = null;
  player.membershipFootprint = [];
  player.live = null;
  player.removedReason = reason;
  for (const a of Object.values(state.activities)) if (a.playerId === player.id && a.status === 'active') { a.status = 'cancelled'; a.cancelReason = '原匹配池已结束，请重新开始跑步。'; }
}

function expirePlayers(state, now, authNow=now) {
  let changed = false;
  for (const p of Object.values(state.players)) {
    if (p.poolId && p.lastValidRunAt && now - p.lastValidRunAt >= RULES.removeAfterMs) { removePlayer(state, p, 'inactive', now); changed = true; }
    if (p.live && now - p.live.seenAt > RULES.liveLifetimeMs) { p.live = null; changed = true; }
  }
  for (const [id, s] of Object.entries(state.sessions)) if (s.expiresAt < authNow) { delete state.sessions[id]; changed = true; }
  for (const [id, invite] of Object.entries(state.invites)) if (invite.expiresAt < now) { delete state.invites[id]; changed = true; }
  for (const a of Object.values(state.activities)) if (a.status === 'active' && now - a.createdAt > 12 * 3600000) { a.status = 'cancelled'; a.cancelReason = '活动已超时'; changed = true; }
  return changed;
}

function selectPool(state, player, footprint, inviteToken, acceptFallback, now) {
  if (player.poolId) {
    if (inviteToken && !acceptFallback && state.invites[inviteToken]?.poolId !== player.poolId) {
      const error = new Error('你已在另一个匹配池，当前不能通过邀请跳池。本次轨迹可以继续在原池结算。');
      error.code = 'INVITE_UNAVAILABLE';
      throw error;
    }
    return state.pools[player.poolId];
  }
  const compatible = pool => pool.id !== player.lastPoolId && pool.members.length < RULES.poolSize && pool.members.some(id => {
    const ratio = overlap(footprint, state.players[id].lastFootprint);
    return ratio > 0 && ratio < 0.95;
  });
  if (inviteToken) {
    const invite = state.invites[inviteToken];
    const inviter = invite && state.players[invite.playerId];
    const target = inviter && state.pools[inviter.poolId];
    const valid = invite && invite.expiresAt > now && target && invite.poolId === target.id && compatible(target);
    if (valid) return target;
    if (!acceptFallback) {
      const error = new Error('好友所在池暂无空位、已更换池或与你的路线缺少部分重叠。可保留本次轨迹，选择普通匹配。');
      error.code = 'INVITE_UNAVAILABLE';
      throw error;
    }
  }
  const pools = Object.values(state.pools).filter(p => p.members.length && compatible(p));
  pools.sort((a,b) => Math.max(...b.members.map(id => overlap(footprint, state.players[id].lastFootprint))) - Math.max(...a.members.map(id => overlap(footprint, state.players[id].lastFootprint))));
  if (pools.length) return pools[0];
  const pool = { id: randomUUID(), name: `第 ${String(Object.keys(state.pools).length + 1).padStart(3, '0')} 池`, createdAt: now, members: [], cells: {} };
  state.pools[pool.id] = pool;
  return pool;
}

function startActivity(state, playerId, now, options = {}) {
  const player = state.players[playerId];
  if (Object.values(state.activities).some(a => a.playerId === playerId && a.status === 'active')) throw new Error('你已有进行中的跑步，请先结束或放弃。');
  const activity = { id: randomUUID(), playerId, createdAt: now, startedAt: now, poolIdAtStart: player.poolId, status: 'active', source: options.simulation ? 'simulation' : 'gps', shareLocation: Boolean(options.shareLocation), invite: options.invite || null };
  state.activities[activity.id] = activity;
  return activity;
}

function cancelActivity(state, playerId, activityId) {
  const a = state.activities[activityId];
  if (!a || a.playerId !== playerId) throw new Error('活动不存在。');
  if (a.status === 'completed') throw new Error('已结算的活动不能撤销。');
  a.status = 'cancelled';
  state.players[playerId].live = null;
}

function finishActivity(state, playerId, activityId, raw, now, { acceptFallback = false, endedAt = now } = {}) {
  const activity = state.activities[activityId], player = state.players[playerId];
  if (!activity || activity.playerId !== playerId) throw new Error('活动不存在。');
  if (activity.status === 'completed') return activity.report;
  if (activity.status !== 'active') throw new Error(activity.cancelReason || '活动已取消。');
  if (activity.poolIdAtStart !== player.poolId) throw new Error('跑步期间匹配池已变化，请重新开始。');
  if (!Number.isFinite(endedAt) || endedAt > now + 10000 || endedAt < activity.startedAt || now - endedAt > 12 * 3600000) throw new Error('跑步结束时间无效或补传已超过 12 小时。');
  const checked = validateRoute(raw, activity.startedAt, endedAt);
  const damage = comebackDamage(player, now);
  const pool = selectPool(state, player, checked.cells, activity.invite, acceptFallback, now);
  const joined = !player.poolId;
  if (joined) {
    pool.members.push(playerId);
    player.poolId = pool.id;
    player.membershipFootprint = [];
    player.effects = {};
    player.removedReason = null;
    event(state, { poolId: pool.id, type: 'joined', playerId, text: `${player.name}加入了本池` }, now);
  }
  const report = { activityId, poolId: pool.id, source: activity.source, routeName:activity.roadRouteName||null, distance: checked.distance, duration: checked.duration, area: checked.area, damage, claimed: 0, fortified: 0, weakened: 0, neutralized: 0, capped: 0, alreadyCounted: 0, claimedArea: 0, weakenedArea: 0, finishedAt: now, changes: [], joined };
  const day = localDay(now);
  for (const key of checked.cells) {
    if (player.effects[key] === day) { report.alreadyCounted++; continue; }
    const cell = pool.cells[key] ||= { owner: null, fortification: 0 };
    const before = { ...cell };
    if (!cell.owner) {
      cell.owner = playerId; cell.fortification = 1; report.claimed++; report.claimedArea += cellArea(key);
    } else if (cell.owner === playerId) {
      if (cell.fortification < RULES.maxFortification) { cell.fortification++; report.fortified++; }
      else report.capped++;
    } else {
      report.weakened++; report.weakenedArea += cellArea(key);
      cell.fortification = Math.max(0, cell.fortification - damage);
      if (!cell.fortification) { cell.owner = null; report.neutralized++; }
    }
    player.effects[key] = day;
    report.changes.push({ key, before, after: { ...cell } });
  }
  player.membershipFootprint = [...new Set([...player.membershipFootprint, ...report.changes.filter(c => c.after.owner === playerId).map(c => c.key)])];
  // 每日额度只需保留当天记录；不为旧数据保留兼容分支。
  player.effects = Object.fromEntries(Object.entries(player.effects).filter(([, d]) => d === day));
  player.lastFootprint = checked.cells;
  player.lastValidRunAt = now;
  player.totalDistance += checked.distance;
  player.runCount++;
  player.live = null;
  activity.status = 'completed';
  activity.route = checked.route;
  activity.report = report;
  delete activity.simulationRoute;
  event(state, { poolId: pool.id, type: 'run', playerId, text: `${player.name}完成闭环 · 新占 ${report.claimed} 格，削弱 ${report.weakened} 格`, report: { claimed: report.claimed, weakened: report.weakened } }, now);
  for (const memberId of [...pool.members]) {
    const member = state.players[memberId];
    if (!member.membershipFootprint.length || ownedCells(state, member).length) continue;
    if (member.membershipFootprint.every(key => pool.cells[key]?.owner && pool.cells[key].owner !== memberId)) removePlayer(state, member, 'conquered', now);
  }
  return report;
}

function updateLive(state, playerId, activityId, point, now) {
  const a = state.activities[activityId], p = state.players[playerId];
  if (!a || a.playerId !== playerId || a.status !== 'active') throw new Error('当前没有进行中的跑步。');
  if (typeof point.share === 'boolean') a.shareLocation = point.share;
  if (!a.shareLocation) { p.live = null; return; }
  if (![point.lat, point.lng].every(Number.isFinite) || Math.abs(point.lat) > 80 || Math.abs(point.lng) > 180) throw new Error('位置无效。');
  p.live = { lat: point.lat, lng: point.lng, seenAt: now, source: a.source };
}

function publicState(state, playerId, now) {
  const player = state.players[playerId], pool = state.pools[player.poolId];
  const owned = ownedCells(state, player);
  const activities = Object.values(state.activities).filter(a => a.playerId === playerId && a.status === 'completed').sort((a,b) => b.report.finishedAt-a.report.finishedAt);
  const active = Object.values(state.activities).find(a => a.playerId === playerId && a.status === 'active');
  return {
    now, rules: RULES,
    player: { id: player.id, name: player.name, color: player.color, kind: player.kind, poolId: player.poolId, lastValidRunAt: player.lastValidRunAt, runCount: player.runCount, totalDistance: player.totalDistance, removedReason: player.removedReason, damage: comebackDamage(player, now), ownedCells: owned.length, area: owned.reduce((sum,[key]) => sum+cellArea(key),0), fortifiedCells: owned.filter(([,c]) => c.fortification === RULES.maxFortification).length, center: owned.length ? cellCenter(owned[Math.floor(owned.length/2)][0]) : player.lastFootprint.length ? cellCenter(player.lastFootprint[0]) : null },
    pool: pool ? { id: pool.id, name: pool.name, members: pool.members.map(id => {
      const p = state.players[id], cells = ownedCells(state,p);
      return { id, name:p.name, color:p.color, ownedCells:cells.length, area:cells.reduce((sum,[key])=>sum+cellArea(key),0), isRunning:Boolean(Object.values(state.activities).find(a=>a.playerId===id && a.status==='active')), source:p.kind };
    }), cells: Object.entries(pool.cells).map(([key,c])=>({ key,...c })), events:state.events.filter(e=>e.poolId===pool.id).slice(-16).reverse() } : null,
    activeActivity: active ? { id:active.id, startedAt:active.startedAt, source:active.source, shareLocation:active.shareLocation,route:active.source==='simulation'?active.simulationRoute:undefined,roadRouteName:active.roadRouteName } : null,
    activities:activities.slice(0,30).map(a=>{
      const {changes,...summary}=a.report;
      return { id:a.id,...summary };
    }),
  };
}

function nearby(state, playerId, center, now) {
  const self = state.players[playerId];
  return Object.values(state.players).filter(p => p.id !== playerId && p.live && now-p.live.seenAt <= RULES.liveLifetimeMs && distance(center,p.live) <= 3000).map(p => {
    // 公开位置独立模糊，领地变细不提高其他人看到的位置精度。
    const location = approximateLocation(p.live);
    const samePool = Boolean(self.poolId && p.poolId === self.poolId);
    return { id:p.id, name:samePool?p.name:'附近跑者', color:samePool?p.color:'#a6adb1', ...location, samePool, approximate:true, source:p.live.source, seenAt:p.live.seenAt };
  });
}

return { emptyState, addPlayer, ownedCells, removePlayer, expirePlayers, startActivity, cancelActivity, finishActivity, updateLive, publicState, nearby };
}
