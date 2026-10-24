-- Same two keys/scope/epoch as project.lua; ARGV[3]=member, ARGV[4]=min version.
-- The gateway has pinned the directory entry and checked its serving health.
local ztype, htype = redis.call('TYPE', KEYS[1]).ok, redis.call('TYPE', KEYS[2]).ok
if (ztype ~= 'none' and ztype ~= 'zset') or htype ~= 'hash' then
  return redis.error_reply('bad key type')
end
local mode = redis.call('HGET', KEYS[2], '__mode')
if redis.call('HGET', KEYS[2], '__scope') ~= ARGV[1]
    or redis.call('HGET', KEYS[2], '__epoch') ~= ARGV[2]
    or (mode ~= 'SERVING' and mode ~= 'FROZEN') then
  return redis.error_reply('epoch not readable')
end
local member, minimum = ARGV[3], tonumber(ARGV[4])
if #member ~= 12 or not string.match(member, '^%d+$') or not minimum
    or minimum < 0 or minimum > 1000000000 or minimum ~= math.floor(minimum) then
  return redis.error_reply('invalid read')
end
local state = redis.call('HGET', KEYS[2], 'p:' .. member)
local r = redis.call('ZREVRANK', KEYS[1], member)
if not state and not r then
  return {minimum > 0 and 'PENDING' or 'UNRANKED', ARGV[2]}
end
if not state or not r then return redis.error_reply('projection incomplete') end
local v, c = string.match(state, '^(%d+):(%d+)$')
v, c = tonumber(v), tonumber(c)
if not v or not c or tonumber(redis.call('ZSCORE', KEYS[1], member)) ~= c then
  return redis.error_reply('projection mismatch')
end
if v < minimum then return {'PENDING', ARGV[2], v} end
local rows = redis.call('ZRANGE', KEYS[1], math.max(0, r-5), r+5, 'REV', 'WITHSCORES')
return {'OK', ARGV[2], v, r+1, rows}
