-- Redis 7+; trusted server only. One hash: gate:{scope}:epoch; never TTL it.
-- ARGV: epoch, token=SHA256(owner,op,key), principal, intent_digest, quantity.
local function uint(s, lo, hi)
  local n = tonumber(s)
  if not n or n ~= math.floor(n) or n < lo or n > hi then return nil end
  return n
end
local epoch, token, principal, digest = ARGV[1], ARGV[2], ARGV[3], ARGV[4]
local q = uint(ARGV[5], 1, 10000)
if #KEYS ~= 1 or #ARGV ~= 5 or not q or not uint(epoch, 1, 1000000000)
  or not token or #token ~= 64 or token:find('[^a-f0-9]')
  or not principal or #principal < 1 or #principal > 128
  or not digest or #digest ~= 64 or digest:find('[^a-f0-9]') then
  return redis.error_reply('INVALID_INPUT')
end
local m = redis.call('HMGET', KEYS[1], 'epoch', 'ready', 'free', 'cap', 'sec', 'used')
if m[1] ~= epoch or m[2] ~= '1' then return {'CLOSED'} end
local free, cap, last, used = uint(m[3], 0, 10000), uint(m[4], 1, 10000),
  uint(m[5], 0, 10000000000), uint(m[6], 0, 500)
if not free or not cap or free > cap or not last or not used then
  return redis.error_reply('CORRUPT_GATE')
end
local old = redis.call('HGET', KEYS[1], 't:' .. token)
if old then
  local ok, r = pcall(cjson.decode, old)
  if not ok or type(r) ~= 'table' then return redis.error_reply('CORRUPT_TOKEN') end
  if r.principal ~= principal or r.digest ~= digest or r.q ~= q then
    return redis.error_reply('IDENTITY_CONFLICT')
  end
  return {'REPLAY', r.state}                           -- query DB; no new allocation
end
local sec = math.max(last, tonumber(redis.call('TIME')[1])) -- clock rollback: fail closed
if sec > last then used = 0 end
if used >= 500 then return {'RATE_LIMITED'} end
if free < q then return {'SOLD_OUT_HINT'} end
local record = cjson.encode({principal=principal, digest=digest, q=q, state='ADMITTED', v=0})
redis.call('HSET', KEYS[1], 'free', free-q, 'sec', sec, 'used', used+1, 't:'..token, record)
return {'ADMITTED', token, epoch}
