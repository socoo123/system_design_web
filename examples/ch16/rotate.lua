-- One in-flight batch per comment; live likes continue accumulating in delta.
local k, id = KEYS[1], ARGV[1]
if not id or #id > 128 or not string.match(id, '^[%w%-]+$') then return redis.error_reply('ID') end
if redis.call('TYPE', k).ok ~= 'hash' then return redis.error_reply('NOT_READY') end
local v = redis.call('HMGET', k, 'ready', 'inflight', 'delta')
if v[1] ~= '1' then return redis.error_reply('NOT_READY') end
if v[2] then
  local frozen = redis.call('HGET', k, 'b:' .. v[2])
  if not frozen then return redis.error_reply('CORRUPT') end
  return {v[2], frozen}
end
if not v[3] or not string.match(v[3], '^%-?%d+$') then return redis.error_reply('CORRUPT') end
if redis.call('HEXISTS', k, 'b:' .. id) == 1 then return redis.error_reply('REUSED') end
redis.call('HSET', k, 'inflight', id, 'b:' .. id, v[3], 'delta', '0')
return {id, v[3]}
