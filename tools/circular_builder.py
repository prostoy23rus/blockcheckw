#!/usr/bin/env python3
"""
Zapret2 Circular Strategy Assembler & Optimizer.
Converts multiple verified single-vector strategies into a resilient rotating
Zapret2 'circular' orchestrator configuration per manual_zapret2.md specification.

Usage:
    python tools/circular_builder.py --input report.json [options]
    python tools/circular_builder.py --input strategies.txt --output circular.txt
    python tools/circular_builder.py --preset youtube --fails 3 --maxtime 20
"""

import sys
import os
import re
import json
import argparse
from typing import List, Dict, Any, Optional

EVASION_FAMILIES = {
    "fake": [r"fake:", r"tls_client_hello_clone"],
    "multidisorder": [r"multidisorder", r"fakeddisorder"],
    "multisplit": [r"multisplit", r"fakedsplit"],
    "hostfakesplit": [r"hostfakesplit"],
    "tcpseg_oob": [r"tcpseg:", r"oob:", r"synack_split", r"synack:"]
}

def classify_strategy(strat_line: str) -> str:
    for fam, patterns in EVASION_FAMILIES.items():
        for pat in patterns:
            if re.search(pat, strat_line, re.IGNORECASE):
                return fam
    return "other"

def clean_strategy_line(line: str) -> str:
    line = line.strip()
    if not line or line.startswith("#") or line.startswith("*"):
        return ""
    # Strip prefix like "curl_test_... : nfqws2 "
    if " : nfqws2 " in line:
        line = line.split(" : nfqws2 ", 1)[1].strip()
    elif line.startswith("nfqws2 "):
        line = line[len("nfqws2 "):].strip()
    if not any(k in line for k in ["lua-desync", "multisplit", "multidisorder", "fake", "hostfake"]):
        return ""
    # Strip --payload=... or range headers if present at the line start
    line = re.sub(r"^--payload=[^\s]+\s*", "", line)
    line = re.sub(r"^--out-range=[^\s]+\s*", "", line)
    line = re.sub(r"^--in-range=[^\s]+\s*", "", line)
    return line.strip()

def parse_strategies_from_input(source: str) -> List[str]:
    # Check if JSON
    try:
        with open(source, "r", encoding="utf-8") as f:
            content = f.read()
        try:
            data = json.loads(content)
            strategies = []
            if "strategies" in data and isinstance(data["strategies"], list):
                for item in data["strategies"]:
                    if isinstance(item, dict) and "args" in item:
                        strategies.append(item["args"])
                    elif isinstance(item, str):
                        strategies.append(item)
            elif "protocols" in data and isinstance(data["protocols"], list):
                for proto in data["protocols"]:
                    for s in proto.get("strategies", []):
                        strategies.append(s)
            if strategies:
                return [clean_strategy_line(s) for s in strategies if clean_strategy_line(s)]
        except json.JSONDecodeError:
            pass
        
        # Parse as plain text lines
        lines = content.splitlines()
        results = []
        for line in lines:
            c = clean_strategy_line(line)
            if c:
                results.append(c)
        return results
    except Exception as e:
        print(f"Error reading {source}: {e}", file=sys.stderr)
        return []

def select_diverse_strategies(strategies: List[str], max_count: int = 4) -> List[str]:
    """Select strategies representing diverse evasion families."""
    family_buckets: Dict[str, List[str]] = {}
    for s in strategies:
        fam = classify_strategy(s)
        family_buckets.setdefault(fam, []).append(s)

    selected: List[str] = []
    # Preference order for diversity
    order = ["fake", "multidisorder", "multisplit", "hostfakesplit", "tcpseg_oob", "other"]
    
    # Round-robin across families
    idx = 0
    while len(selected) < max_count:
        added_in_round = False
        for fam in order:
            bucket = family_buckets.get(fam, [])
            if idx < len(bucket):
                cand = bucket[idx]
                if cand not in selected:
                    selected.append(cand)
                    added_in_round = True
                    if len(selected) >= max_count:
                        break
        idx += 1
        if not added_in_round:
            break

    # If still not enough, fill with remaining
    if len(selected) < max_count:
        for s in strategies:
            if s not in selected:
                selected.append(s)
                if len(selected) >= max_count:
                    break

    return selected

def build_circular_script(
    strategies: List[str],
    fails: int = 3,
    maxtime: int = 20,
    retrans: int = 2,
    maxseq: int = 32768,
    is_final: bool = False,
    payload: str = "tls_client_hello"
) -> str:
    """
    Builds the exact Zapret2 circular script as specified in manual_zapret2.md:
    --out-range=-s34228
    --payload=tls_client_hello
    --in-range=-s5556 --lua-desync=circular:fails=3:maxtime=20
    --in-range=x
    --lua-desync=...:strategy=1
    ...
    --lua-desync=...:strategy=N[:final]
    """
    lines = [
        "--out-range=-s34228",
        f"--payload={payload}",
        f"--in-range=-s5556 --lua-desync=circular:fails={fails}:maxtime={maxtime}",
        "--in-range=x"
    ]

    for i, strat in enumerate(strategies, start=1):
        is_last = (i == len(strategies))
        strat_tag = f":strategy={i}"
        if is_last and is_final:
            strat_tag += ":final"

        # A strategy may contain multiple desync actions, e.g.:
        # --lua-desync=fake:... --lua-desync=multisplit:...
        tokens = strat.split("--lua-desync=")
        parts = []
        for t in tokens:
            t = t.strip()
            if not t:
                continue
            # Remove any trailing arguments or options not belonging to desync
            parts.append(f"--lua-desync={t}{strat_tag}")

        if parts:
            lines.extend(parts)
        else:
            lines.append(f"--lua-desync={strat}{strat_tag}")

    return "\n".join(lines)

def main():
    parser = argparse.ArgumentParser(description="Zapret2 Circular Strategy Assembler")
    parser.add_argument("-i", "--input", help="Path to input report (JSON or vanilla TXT)")
    parser.add_argument("-o", "--output", help="Output path for circular strategy file")
    parser.add_argument("--fails", type=int, default=3, help="Failures before switching strategy (default: 3)")
    parser.add_argument("--maxtime", type=int, default=20, help="Max seconds between failures (default: 20)")
    parser.add_argument("--retrans", type=int, default=2, help="Retransmissions threshold (default: 2)")
    parser.add_argument("--count", type=int, default=4, help="Number of diverse strategies to combine (default: 4)")
    parser.add_argument("--final", action="store_true", help="Mark the last strategy with :final (stop rotating)")
    parser.add_argument("--payload", default="tls_client_hello", help="Target payload (default: tls_client_hello)")
    parser.add_argument("--json", action="store_true", help="Output result as JSON")
    args = parser.parse_args()

    if not args.input:
        parser.print_help()
        sys.exit(1)

    strategies = parse_strategies_from_input(args.input)
    if not strategies:
        print(f"Error: No valid strategies found in {args.input}", file=sys.stderr)
        sys.exit(1)

    diverse = select_diverse_strategies(strategies, max_count=args.count)
    script = build_circular_script(
        diverse,
        fails=args.fails,
        maxtime=args.maxtime,
        retrans=args.retrans,
        is_final=args.final,
        payload=args.payload
    )

    if args.json:
        out_obj = {
            "status": "success",
            "source_count": len(strategies),
            "selected_count": len(diverse),
            "fails": args.fails,
            "maxtime": args.maxtime,
            "final": args.final,
            "strategies": diverse,
            "script": script
        }
        res_text = json.dumps(out_obj, indent=2, ensure_ascii=False)
    else:
        res_text = script

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(res_text + "\n")
        print(f"Saved circular strategy ({len(diverse)} chained vectors) to {args.output}")
    else:
        print(res_text)

if __name__ == "__main__":
    main()
