import {randomUUID} from 'node:crypto';
import {createGame} from '../shared/game.mjs';
export const { emptyState, addPlayer, ownedCells, removePlayer, expirePlayers, startActivity, cancelActivity, finishActivity, updateLive, publicState, nearby } = createGame(randomUUID);
