-- Install an immutable epoch namespace once; KEYS are meta/list/amounts/users.
-- ARGV epoch, token, deadline_ms, sid, amount, sid, amount, ...
local epoch, deadline = tonumber(ARGV[1]), tonumber(ARGV[3])
if not epoch or epoch < 1 or epoch ~= math.floor(epoch) or epoch > 1000000000000
   or not deadline or deadline < 1 or deadline ~= math.floor(deadline)
   or deadline > 9007199254740991 or #ARGV % 2 ~= 1 or #ARGV > 203 then
  return {'INVALID'}
end
local t = redis.call('TYPE', KEYS[1]).ok
if t ~= 'none' and t ~= 'hash' then return {'RECOVER','meta type'} end
if t == 'hash' then
  if redis.call('HGET', KEYS[1], 'token') ~= ARGV[2] then return {'CONFLICT'} end
  return {'EXISTS',redis.call('HGET', KEYS[1], 'status') or 'BROKEN'}
end
for i=2,4 do
  if redis.call('EXISTS',KEYS[i]) ~= 0 then return {'RECOVER','orphan key'} end
end
local total, seen = 0, {}
for i=4,#ARGV,2 do
  local a = tonumber(ARGV[i+1])
  if not a or a < 1 or a ~= math.floor(a) or seen[ARGV[i]] then return {'INVALID'} end
  seen[ARGV[i]] = true; total = total+a
  if total > 1000000000000 then return {'INVALID'} end
end
for i=4,#ARGV,2 do
  redis.call('RPUSH',KEYS[2],ARGV[i])
  redis.call('HSET',KEYS[3],ARGV[i],ARGV[i+1])
end
-- Keep amounts as an existing empty hash even for a fully claimed packet.
redis.call('HSET',KEYS[3],'__plan_marker','0')
redis.call('HSET',KEYS[1],'epoch',ARGV[1],'token',ARGV[2],'status','READY',
  'deadline_ms',ARGV[3],'n',tostring((#ARGV-3)/2),'cents',tostring(total))
return {'READY',ARGV[1],ARGV[2]}
