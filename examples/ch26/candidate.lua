-- KEYS: meta, list, immutable amounts, user->share; all share one hash tag.
-- ARGV: trusted expected epoch, authenticated user; no client amount.
local function integer(s)
  local n = tonumber(s)
  if not n or n ~= math.floor(n) or n < 0 or n > 9007199254740991 then return nil end
  return n
end
for i, want in ipairs({'hash','list','hash','hash'}) do
  local t = redis.call('TYPE', KEYS[i]).ok
  if t ~= want and not (t == 'none' and (i == 2 or i == 4)) then
    return {'RECOVER', 'key type or missing projection'}
  end
end
local m = redis.call('HMGET', KEYS[1], 'epoch','status','deadline_ms','n','cents')
local epoch, deadline, n, cents = integer(m[1]), integer(m[3]), integer(m[4]), integer(m[5])
if not epoch or not deadline or not n or n > 100 or not cents or cents > 1000000000000 then
  return {'RECOVER','bad meta'}
end
if m[1] ~= ARGV[1] or m[2] ~= 'ACTIVE' then return {'RETRY','epoch or gate'} end
local old = redis.call('HGET', KEYS[4], ARGV[2])
if old then
  local amount = integer(redis.call('HGET', KEYS[3], old))
  if not amount or amount < 1 then return {'RECOVER','bad prior candidate'} end
  return {'CANDIDATE',old,tostring(amount),m[1]}
end
local now = redis.call('TIME')
if tonumber(now[1])*1000 + math.floor(tonumber(now[2])/1000) >= deadline then
  return {'EXPIRED'} -- advisory only; Packet DB makes the final time decision
end
if n == 0 then
  if cents ~= 0 or redis.call('LLEN',KEYS[2]) ~= 0 then return {'RECOVER','bad empty'} end
  return {'EMPTY'}
end
local sid = redis.call('LINDEX', KEYS[2], 0)
local amount = sid and integer(redis.call('HGET', KEYS[3], sid))
if not amount or amount < 1 or cents < amount or redis.call('LLEN',KEYS[2]) ~= n then
  return {'RECOVER','bad inventory'}
end
-- Validation precedes mutations. A runtime error still does not roll them back.
redis.call('LPOP', KEYS[2])
redis.call('HSET', KEYS[1], 'n', tostring(n-1), 'cents', tostring(cents-amount))
redis.call('HSET', KEYS[4], ARGV[2], sid)
return {'CANDIDATE',sid,tostring(amount),m[1]} -- never a durable receipt
