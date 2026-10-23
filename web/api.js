export async function api(path,body) {
  const response=await fetch(`/api${path}`,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const result=await response.json();
  if(!response.ok) throw Object.assign(new Error(result.error || '暂时无法连接，请稍后重试。'),{code:result.code,status:response.status});
  return result;
}
