-- Shared deterministic generator; every segment has a reachable platform and an overhead anchor.
local Course = {}
function Course.Generate(seed)
    local state = seed + 0.0
    local function random(low, high)
        state = (state * 48271) % 2147483647
        return low + state % (high - low + 1)
    end
    local result = {}
    local y, x = 180, 0
    for i = 0, 13 do
        if i > 0 then y = math.max(50, math.min(260, y + random(-45, 45))); x=x+random(285,370) end
        result[#result+1] = {x=x, y=y, width=i==0 and 320 or random(220,270), boost=i>0 and i%4==0, hazard=i%4==3}
    end
    return result
end
return Course
