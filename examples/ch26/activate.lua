-- Same epoch/token check is retryable after Packet DB opens the gate.
if redis.call('HGET',KEYS[1],'epoch') ~= ARGV[1] or
   redis.call('HGET',KEYS[1],'token') ~= ARGV[2] then return {'STALE'} end
redis.call('HSET',KEYS[1],'status','ACTIVE')
return {'ACTIVE'}
