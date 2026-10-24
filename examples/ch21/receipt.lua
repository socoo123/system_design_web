-- Trusted DB outbox only. ARGV: epoch, token, principal, digest, q, version, state.
local terminal = {CONFIRMED=true, RELEASED=true, REJECTED=true, CANCELLED=true}
local restore = {RELEASED=true, REJECTED=true, CANCELLED=true}
local function uint(s, lo, hi)
  local n = tonumber(s)
  if not n or n ~= math.floor(n) or n < lo or n > hi then return nil end
  return n
end
local e, token, p, d, state = ARGV[1], ARGV[2], ARGV[3], ARGV[4], ARGV[7]
local q, v = uint(ARGV[5],1,10000), uint(ARGV[6],1,2)
if #KEYS ~= 1 or #ARGV ~= 7 or not q or not v
  or not (terminal[state] or state == 'HELD')
  or (state == 'HELD' and v ~= 1) or (state == 'RELEASED' and v ~= 2)
  or (state == 'CONFIRMED' and v ~= 2)
  or ((state == 'REJECTED' or state == 'CANCELLED') and v ~= 1) then
  return redis.error_reply('INVALID_RECEIPT')
end
local m = redis.call('HMGET', KEYS[1], 'epoch', 'ready', 'free', 'cap', 't:'..token)
if m[1] ~= e or m[2] ~= '1' then return {'STALE_OR_CLOSED'} end
if not m[5] then return {'NO_OWNERSHIP'} end          -- never mint quota from nothing
local ok, r = pcall(cjson.decode, m[5])
local free, cap = uint(m[3],0,10000), uint(m[4],1,10000)
if not ok or type(r) ~= 'table' or not free or not cap or free > cap
  or not uint(r.v,0,2) or not (r.state == 'ADMITTED' or r.state == 'HELD' or terminal[r.state]) then
  return redis.error_reply('CORRUPT_GATE')
end
if r.principal ~= p or r.digest ~= d or r.q ~= q then return redis.error_reply('BINDING') end
if v < r.v then return {'STALE'} end
if v == r.v then
  if state ~= r.state then return redis.error_reply('CONFLICT') end
  return {'REPLAY'}
end
if terminal[r.state] then return redis.error_reply('TERMINAL_CONFLICT') end
local next_free = free + (restore[state] and q or 0)
if next_free > cap then return redis.error_reply('COUNTER_MISMATCH') end
r.state, r.v = state, v
local record = cjson.encode(r)                        -- encode BEFORE the sole write
redis.call('HSET', KEYS[1], 'free', next_free, 't:'..token, record)
return {'APPLIED', state}
