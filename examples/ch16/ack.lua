-- Trusted flusher calls only after the authority committed the matching payload.
local k, id, payload = KEYS[1], ARGV[1], ARGV[2]
if redis.call('TYPE', k).ok ~= 'hash' then return redis.error_reply('NOT_READY') end
local v = redis.call('HMGET', k, 'inflight', 'b:' .. id)
if v[1] ~= id then return 0 end
if v[2] ~= payload then return redis.error_reply('PAYLOAD') end
return redis.call('HDEL', k, 'inflight', 'b:' .. id)
