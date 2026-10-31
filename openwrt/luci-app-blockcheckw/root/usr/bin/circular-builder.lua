#!/usr/bin/lua
-- Zapret2 Circular Strategy Assembler for OpenWrt (Lua 5.1+)
-- specification based on manual_zapret2.md

local json = require("luci.jsonc")

local function classify(strat)
    strat = strat:lower()
    if strat:find("fake:") or strat:find("tls_client_hello_clone") then
        return "fake"
    elseif strat:find("multidisorder") or strat:find("fakeddisorder") then
        return "multidisorder"
    elseif strat:find("multisplit") or strat:find("fakedsplit") then
        return "multisplit"
    elseif strat:find("hostfakesplit") then
        return "hostfakesplit"
    elseif strat:find("tcpseg:") or strat:find("oob:") or strat:find("synack") then
        return "tcpseg_oob"
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
    if not line:find("lua%-desync") and not line:find("multisplit") and not line:find("multidisorder") and not line:find("fake") then
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
    -- Try JSON first
    local parsed = json.parse(content)
    if parsed and type(parsed) == "table" then
        if type(parsed.strategies) == "table" then
            for _, item in ipairs(parsed.strategies) do
                local s = (type(item) == "table" and item.args) or (type(item) == "string" and item)
                if s then
                    local c = clean_strategy(s)
                    if c then table.insert(strats, c) end
                end
            end
        elseif type(parsed.protocols) == "table" then
            for _, p in ipairs(parsed.protocols) do
                if type(p.strategies) == "table" then
                    for _, s in ipairs(p.strategies) do
                        local c = clean_strategy(s)
                        if c then table.insert(strats, c) end
                    end
                end
            end
        end
        if #strats > 0 then return strats end
    end

    -- Plain text lines
    for line in content:gmatch("[^\r\n]+") do
        local c = clean_strategy(line)
        if c then
            table.insert(strats, c)
        end
    end
    return strats
end

local function select_diverse(strategies, max_count)
    max_count = max_count or 4
    local buckets = {}
    for _, s in ipairs(strategies) do
        local fam = classify(s)
        buckets[fam] = buckets[fam] or {}
        table.insert(buckets[fam], s)
    end

    local order = { "fake", "multidisorder", "multisplit", "hostfakesplit", "tcpseg_oob", "other" }
    local selected = {}
    local seen = {}

    local round = 1
    while #selected < max_count do
        local added = false
        for _, fam in ipairs(order) do
            local b = buckets[fam]
            if b and b[round] then
                local cand = b[round]
                if not seen[cand] then
                    seen[cand] = true
                    table.insert(selected, cand)
                    added = true
                    if #selected >= max_count then break end
                end
            end
        end
        round = round + 1
        if not added then break end
    end

    -- Fill remaining if needed
    if #selected < max_count then
        for _, s in ipairs(strategies) do
            if not seen[s] then
                seen[s] = true
                table.insert(selected, s)
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
            local parts = {}
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

if not input_file then
    io.stderr:write("Usage: lua circular-builder.lua <input_file> [fails] [maxtime] [count] [final|loop] [payload]\n")
    os.exit(1)
end

local strats = parse_strategies(input_file)
if #strats == 0 then
    io.stderr:write("Error: no strategies found in " .. input_file .. "\n")
    os.exit(2)
end

local diverse = select_diverse(strats, max_count)
local script = build_circular(diverse, fails, maxtime, is_final, payload)

print(script)
