-- Redis 7+; KEYS = scores ZSET, state HASH, with one board/bucket/epoch hash tag.
-- ARGV = scope, epoch, 12-digit member, version, exact integer composite C.
local function integer(s, lo, hi)
  local n = tonumber(s)
  if not n or n < lo or n > hi or n ~= math.floor(n)
      or string.format('%.0f', n) ~= s then error('invalid integer') end
  return n
end
local ztype, htype = redis.call('TYPE', KEYS[1]).ok, redis.call('TYPE', KEYS[2]).ok
if (ztype ~= 'none' and ztype ~= 'zset') or htype ~= 'hash' then
  return redis.error_reply('bad key type')
end
local scope, epoch, member = ARGV[1], ARGV[2], ARGV[3]
local v, c = integer(ARGV[4], 1, 1000000000), integer(ARGV[5], 0, 3000004000000)
if #member ~= 12 or not string.match(member, '^%d+$') then error('member') end
local mode = redis.call('HGET', KEYS[2], '__mode')
if redis.call('HGET', KEYS[2], '__scope') ~= scope
    or redis.call('HGET', KEYS[2], '__epoch') ~= epoch
    or (mode ~= 'LOADING' and mode ~= 'SERVING') then
  return redis.error_reply('fenced epoch')
end
local old = redis.call('HGET', KEYS[2], 'p:' .. member)
if old then
  local ov, oc = string.match(old, '^(%d+):(%d+)$')
  ov, oc = integer(ov, 1, 1000000000), integer(oc, 0, 3000004000000)
  if tonumber(redis.call('ZSCORE', KEYS[1], member)) ~= oc then
    return redis.error_reply('projection mismatch: rebuild required')
  end
  if v < ov then return 'STALE' end
  if v == ov and c ~= oc then return redis.error_reply('version conflict') end
  if v == ov then return 'REPLAY' end
elseif redis.call('ZSCORE', KEYS[1], member) then
  return redis.error_reply('missing version: rebuild required')
end
redis.call('ZADD', KEYS[1], ARGV[5], member) -- absolute value; lower C is valid
redis.call('HSET', KEYS[2], 'p:' .. member, ARGV[4] .. ':' .. ARGV[5])
return 'APPLIED'
-- Runtime write error is NOT rolled back: quarantine this epoch, do not checkpoint.
