-- Redis 7+ teaching example; KEYS[1]: trusted quota key, ARGV[1]: cost.
-- Policy v1: B=4; 15000 credits/token; refill=1 credit/ms.
local function integer(x, lo, hi)
  return type(x) == 'number' and x >= lo and x <= hi and x == math.floor(x)
end
local cost = tonumber(ARGV[1])
if #KEYS ~= 1 or not integer(cost, 1, 4) then
  return redis.error_reply('INVALID_COST_OR_KEY')
end
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local raw = redis.call('GET', KEYS[1])
local state = {v=1, credit=60000, last=now}
if raw then state = cjson.decode(raw) end
-- The timestamp bound also keeps JSON encoding exact for this example.
if not integer(now, 0, 9000000000000) or type(state) ~= 'table'
   or state.v ~= 1 or not integer(state.credit, 0, 60000)
   or not integer(state.last, 0, 9000000000000) then
  return redis.error_reply('INVALID_STATE_OR_CLOCK')
end
local effective = math.max(now, state.last)
local elapsed = math.min(60000, effective - state.last)
local available = math.min(60000, state.credit + elapsed)
local needed = cost * 15000
local allowed = available >= needed
local remaining = allowed and (available - needed) or available
local lag = effective - now
local wait_ms = allowed and 0 or (lag + needed - available)
local payload = cjson.encode({v=1, credit=remaining, last=effective})
-- The only write commits both state and expiry; errors return no allow.
redis.call('SET', KEYS[1], payload, 'PX', 120000 + lag)
return {allowed and 1 or 0, remaining, wait_ms}
