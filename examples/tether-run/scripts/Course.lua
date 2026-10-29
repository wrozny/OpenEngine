-- Seeded shuffle bags vary traversal, not just deck spacing. Every deck keeps a safe spine.
local Course = {}
local patterns = {"Stairworks", "Skyline gaps", "Upper express", "Switchyard", "Launch district"}
function Course.Generate(seed)
    local state = seed + 0.0
    local function random(low, high)
        state = (state * 48271) % 2147483647
        return low + state % (high - low + 1)
    end
    local bag = {}
    local function nextPattern()
        if #bag == 0 then
            for i = 1, #patterns do bag[i] = patterns[i] end
            for i = #bag, 2, -1 do
                local j = random(1, i)
                bag[i], bag[j] = bag[j], bag[i]
            end
        end
        return table.remove(bag)
    end
    local result = {{x=0, y=180, width=320, anchorX=40, anchorHeight=205, district="Departure", palette=1}}
    local x, y, pattern = 0, 180, ""
    local count = random(14, 18)
    for i = 2, count do
        if (i-2)%3 == 0 then pattern = nextPattern() end
        local gap, rise, width = random(285,355), random(-45,45), random(220,290)
        if pattern == "Stairworks" then gap=270;rise=-70;width=210
        elseif pattern == "Skyline gaps" then gap=random(370,425);rise=random(-25,35);width=190
        elseif pattern == "Upper express" then gap=350;rise=random(-50,50)
        elseif pattern == "Switchyard" then gap=300;rise=(i%2==0 and -65 or 65);width=240
        elseif pattern == "Launch district" then gap=390;rise=random(-40,40);width=260 end
        x=x+gap;y=math.max(-100,math.min(260,y+rise))
        result[#result+1] = {
            x=x, y=y, width=width, district=pattern, palette=math.floor((i-2)/3)%3+1,
            anchorX=random(-35,55), anchorHeight=random(180,255),
            bridge=pattern=="Skyline gaps", shortcut=pattern=="Upper express",
            boost=pattern=="Launch district" or i==5,
            hazard=pattern=="Switchyard" and i%2==0, pulse=i%2==0,
            offset=random(0,30)/10,
        }
    end
    -- The last deck is always clear, so the finish is readable and fair.
    result[#result].hazard=false
    return result
end
return Course
