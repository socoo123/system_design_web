-- Same string lock as SET NX PX; not Redisson's reentrant hash format.
-- ARGV[1]: owner; ARGV[2]: positive TTL in milliseconds, at most one day.
local ttl = tonumber(ARGV[2])
if not ttl or ttl ~= math.floor(ttl) or ttl < 1 or ttl > 86400000 then
  return redis.error_reply('invalid TTL')
end
if redis.call('GET', KEYS[1]) ~= ARGV[1] then
  return 0
end
-- Owner comparison and expiry change execute on this Redis instance atomically.
return redis.call('PEXPIRE', KEYS[1], ttl)
