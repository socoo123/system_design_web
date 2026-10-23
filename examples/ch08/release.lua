-- KEYS[1]: one string lock; ARGV[1]: this attempt's random owner.
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
