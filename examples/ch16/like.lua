-- Redis 7.2+ teaching example: one complete, non-expiring comment hash.
-- KEYS[1]=like:{comment:100}; ARGV=authenticated user id, desired 0/1.
local key, user, wanted = KEYS[1], ARGV[1], ARGV[2]
if not user or not string.match(user, '^%d+$') or
   (wanted ~= '0' and wanted ~= '1') then return redis.error_reply('INPUT') end
if redis.call('TYPE', key).ok ~= 'hash' then return redis.error_reply('NOT_READY') end
local v = redis.call('HMGET', key, 'ready', 'total', 'delta', 'u:' .. user)
local function integer(s)
  if not s or not string.match(s, '^%-?%d+$') then return nil end
  local n = tonumber(s)
  if not n or math.abs(n) > 1000000000000 then return nil end
  return n
end
local total, dirty = integer(v[2]), integer(v[3])
local old = v[4] or '0'
if v[1] ~= '1' or not total or total < 0 or not dirty or
   (old ~= '0' and old ~= '1') then return redis.error_reply('CORRUPT') end
local delta = tonumber(wanted) - tonumber(old)
local next_total, next_dirty = total + delta, dirty + delta
if next_total < 0 or next_total > 1000000000000 or
   math.abs(next_dirty) > 1000000000000 then return redis.error_reply('RANGE') end
if delta ~= 0 then
  -- One mutation: no member write followed by a possibly failing INCR.
  redis.call('HSET', key, 'u:' .. user, wanted,
             'total', string.format('%.0f', next_total),
             'delta', string.format('%.0f', next_dirty))
end
return {delta, next_total, next_dirty}
