#!/usr/bin/lua
-- Zapret2 Circular Strategy Assembler for OpenWrt (Lua 5.1+)
-- Autonomous Orthogonal Engine based on Geneva CCS'19, zapret2, and b4 specs

local json = require("luci.jsonc")

local function classify(strat)
    strat = strat:lower()
    if strat:find("hostfakesplit") or strat:find("hostfake") then
        return "hostfake"
    elseif strat:find("pos=8,12") or strat:find("pos=1,8,12") or strat:find("8,12") then
        return "geneva"
    elseif strat:find("seqovl") then
        return "seqovl"
    elseif strat:find("multidisorder") or strat:find("fakeddisorder") then
        return "multidisorder"
    elseif strat:find("fake:") or strat:find("badsum") or strat:find("tls_client_hello_clone") then
        return "fake"
    elseif strat:find("oob:") or strat:find("urp=") then
        return "oob"
    elseif strat:find("syndata") then
        return "syndata"
    elseif strat:find("wssize") then
        return "wssize"
    elseif strat:find("multisplit") or strat:find("fakedsplit") then
        return "multisplit"
    else
        return "other"
    end
end

local function clean_strategy(line)
    if not line or line == "" or line:sub(1,1) == "#" or line:sub(1,1) == "*" then return nil end
    local nfqws_idx = line:find(" : nfqws2 ")
    if nfqws_idx then
        line = line:sub(nfqws_idx + 10)
    elseif line:sub(1, 7) == "nfqws2 " then
        line = line:sub(8)
    end
    -- Must contain --lua-desync or valid desync args
    if not line:find("lua%-desync") and not line:find("multisplit") and not line:find("multidisorder") and not line:find("fake") and not line:find("oob") then
        return nil
    end
    -- strip headers if attached anywhere in line
    line = line:gsub("%-%-payload=[^%s]+%s*", "")
    line = line:gsub("%-%-out%-range=[^%s]+%s*", "")
    line = line:gsub("%-%-in%-range=[^%s]+%s*", "")
    line = line:gsub("^%s*(.-)%s*$", "%1")
    if line == "" then return nil end
    return line
end

local function parse_strategies(file_path)
    local f = io.open(file_path, "r")
    if not f then return {} end
    local content = f:read("*a")
    f:close()

    local strats = {}
    local seen_strats = {}
    -- Try JSON first
    local parsed = json.parse(content)
    if parsed and type(parsed) == "table" then
        if type(parsed.strategies) == "table" then
            for _, item in ipairs(parsed.strategies) do
                local s = (type(item) == "table" and item.args) or (type(item) == "string" and item)
                if s then
                    local c = clean_strategy(s)
                    if c and not seen_strats[c] then
                        seen_strats[c] = true
                        table.insert(strats, c)
                    end
                end
            end
        elseif type(parsed.protocols) == "table" then
            for _, p in ipairs(parsed.protocols) do
                if type(p.strategies) == "table" then
                    for _, s in ipairs(p.strategies) do
                        local c = clean_strategy(s)
                        if c and not seen_strats[c] then
                            seen_strats[c] = true
                            table.insert(strats, c)
                        end
                    end
                end
            end
        end
        if #strats > 0 then return strats end
    end

    -- Plain text lines
    for line in content:gmatch("[^\r\n]+") do
        local c = clean_strategy(line)
        if c and not seen_strats[c] then
            seen_strats[c] = true
            table.insert(strats, c)
        end
    end
    return strats
end

local function select_orthogonal(strategies, max_count, target)
    max_count = max_count or 4
    local is_discord = (target and target:lower():find("discord") ~= nil)

    local filtered = {}
    for _, s in ipairs(strategies) do
        -- Strictly exclude wssize for Discord targets to prevent voice/websocket stalling
        if not (is_discord and s:lower():find("wssize")) then
            table.insert(filtered, s)
        end
    end

    local buckets = {}
    for _, s in ipairs(filtered) do
        local fam = classify(s)
        buckets[fam] = buckets[fam] or {}
        table.insert(buckets[fam], s)
    end

    local selected = {}
    local seen_strats = {}
    local used_fams = {}

    local function try_add(fams_to_try)
        for _, fam in ipairs(fams_to_try) do
            local b = buckets[fam]
            if b then
                for _, cand in ipairs(b) do
                    if not seen_strats[cand] then
                        seen_strats[cand] = true
                        used_fams[fam] = true
                        table.insert(selected, cand)
                        return true
                    end
                end
            end
        end
        return false
    end

    -- Slot 1: Hostfake / Whitelist vector (gosuslugi, t2, vk, google)
    try_add({ "hostfake" })

    -- Slot 2: TCB Desync / Geneva 8+4 / Seqovl vector
    try_add({ "geneva", "seqovl" })

    -- Slot 3: Packet Disordering vector
    try_add({ "multidisorder" })

    -- Slot 4: Payload / Fake / OOB / Syndata / Clean Split vector
    local slot4_fams = { "fake", "oob", "syndata", "multisplit" }
    if not is_discord then table.insert(slot4_fams, "wssize") end
    try_add(slot4_fams)

    -- Fallback pass: Pick from unused families
    local all_fams = { "hostfake", "geneva", "seqovl", "multidisorder", "fake", "oob", "syndata", "multisplit" }
    if not is_discord then table.insert(all_fams, "wssize") end
    table.insert(all_fams, "other")

    while #selected < max_count do
        local added = false
        for _, fam in ipairs(all_fams) do
            if not used_fams[fam] and buckets[fam] then
                for _, cand in ipairs(buckets[fam]) do
                    if not seen_strats[cand] then
                        seen_strats[cand] = true
                        used_fams[fam] = true
                        table.insert(selected, cand)
                        added = true
                        if #selected >= max_count then break end
                    end
                end
            end
            if #selected >= max_count then break end
        end
        if not added then break end
    end

    -- Second fallback pass: Fill with any remaining unique strategies
    if #selected < max_count then
        for _, cand in ipairs(filtered) do
            if not seen_strats[cand] then
                seen_strats[cand] = true
                table.insert(selected, cand)
                if #selected >= max_count then break end
            end
        end
    end

    return selected
end

local function build_circular(strategies, fails, maxtime, is_final, payload)
    fails = fails or 3
    maxtime = maxtime or 20
    payload = payload or "tls_client_hello"
    local lines = {
        "--out-range=-s34228",
        "--payload=" .. payload,
        string.format("--in-range=-s5556 --lua-desync=circular:fails=%d:maxtime=%d", fails, maxtime),
        "--in-range=x"
    }

    for i, strat in ipairs(strategies) do
        local tag = ":strategy=" .. i
        if i == #strategies and is_final then
            tag = tag .. ":final"
        end

        -- Handle multiple desync actions in one strategy
        if strat:find("%-%-lua%-desync=") then
            for token in strat:gmatch("%-%-lua%-desync=([^%s]+)") do
                table.insert(lines, "--lua-desync=" .. token .. tag)
            end
        else
            table.insert(lines, "--lua-desync=" .. strat .. tag)
        end
    end

    return table.concat(lines, "\n")
end

-- CLI Runner
local input_file = arg[1]
local fails = tonumber(arg[2]) or 3
local maxtime = tonumber(arg[3]) or 20
local max_count = tonumber(arg[4]) or 4
local is_final = (arg[5] == "final")
local payload = arg[6] or "tls_client_hello"
local target = arg[7] or ""

if not input_file then
    io.stderr:write("Usage: lua circular-builder.lua <input_file> [fails] [maxtime] [count] [final|loop] [payload] [target]\n")
    os.exit(1)
end

local strats = parse_strategies(input_file)
if #strats == 0 then
    io.stderr:write("Error: no strategies found in " .. input_file .. "\n")
    os.exit(2)
end

local diverse = select_orthogonal(strats, max_count, target)
local script = build_circular(diverse, fails, maxtime, is_final, payload)

print(script)
