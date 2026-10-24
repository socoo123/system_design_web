-- Offline recovery only. KEYS[1] is a fresh epoch key; ARGV[1] immutable snapshot JSON.
-- No DEL/TTL/live overwrite. Failure during writes leaves ready=0, never a usable half-state.
if #KEYS ~= 1 or #ARGV ~= 1 or #ARGV[1] > 4000000 then return redis.error_reply('INPUT') end
local ok, s = pcall(cjson.decode, ARGV[1])
local function uint(n, lo, hi)
  return type(n) == 'number' and n == math.floor(n) and n >= lo and n <= hi
end
if not ok or type(s) ~= 'table' or not uint(s.epoch,1,1000000000)
  or not uint(s.cap,1,10000) or not uint(s.free,0,s.cap)
  or type(s.snapshot) ~= 'string' or #s.snapshot ~= 64 or type(s.tokens) ~= 'table' then
  return redis.error_reply('SNAPSHOT')
end
if redis.call('EXISTS',KEYS[1]) == 1 then
  local m = redis.call('HMGET',KEYS[1],'epoch','snapshot','ready')
  if m[1] ~= tostring(s.epoch) or m[2] ~= s.snapshot then return redis.error_reply('EXISTING_BASELINE') end
  if m[3] == '1' then return {'REPLAY'} end
  if m[3] ~= '0' then return redis.error_reply('CORRUPT_BASELINE') end
end
local args = {}
local count = 0
local states = {HELD=true,CONFIRMED=true,RELEASED=true,REJECTED=true,CANCELLED=true}
for token,r in pairs(s.tokens) do
  count = count + 1
  if count > 20000 or type(token) ~= 'string' or #token ~= 64 or token:find('[^a-f0-9]')
    or type(r) ~= 'table' or type(r.principal) ~= 'string' or #r.principal < 1
    or #r.principal > 128 or type(r.digest) ~= 'string' or #r.digest ~= 64
    or r.digest:find('[^a-f0-9]') or not uint(r.q,1,10000) or not states[r.state]
    or not uint(r.v,1,2) then return redis.error_reply('TOKEN') end
  local expected = (r.state == 'CONFIRMED' or r.state == 'RELEASED') and 2 or 1
  if r.v ~= expected then return redis.error_reply('TOKEN_VERSION') end
  args[#args+1], args[#args+2] = 't:'..token, cjson.encode(r)
end
-- Every record was validated/encoded before mutation. Bounded chunks avoid Lua unpack limits.
redis.call('HSET',KEYS[1],'epoch',s.epoch,'snapshot',s.snapshot,'ready','0',
  'cap',s.cap,'free',s.free,'sec','0','used','0')
for first = 1, #args, 400 do
  redis.call('HSET',KEYS[1],unpack(args,first,math.min(first+399,#args)))
end
if redis.call('HLEN',KEYS[1]) ~= count+7 then return redis.error_reply('PARTIAL_BASELINE') end
redis.call('HSET',KEYS[1],'ready','1')                 -- no admission until complete
return {'INSTALLED',tostring(count)}
