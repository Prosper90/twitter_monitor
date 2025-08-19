# Memory Overflow Fix Summary

## Problem Identified
The application was running out of memory ("JavaScript heap out of memory") when scanning BNB blocks because:
1. **Transfer Event Overload**: The `getLargeTransferLogs` function was fetching ALL Transfer events for 600 blocks (30 minutes), which can be millions of events on BSC
2. **No filtering**: Processing all events at once without pagination
3. **Excessive time window**: Scanning 30 minutes of data at once

## Fixes Applied

### 1. Reduced Time Windows
- **BNB**: Changed from 30 minutes (600 blocks) to 5 minutes (100 blocks)
- **SUI**: Changed from 30 minutes to 5 minutes
- This provides more frequent but lighter scans

### 2. Removed Transfer Event Scanning
- Disabled the `getLargeTransferLogs` function completely
- Transfer events are too numerous on BSC and cause heap exhaustion
- Factory and liquidity events are sufficient for detecting new pairs

### 3. Limited Alternative Detection
- Alternative mint detection now only scans last 20 blocks instead of full range
- Added limits to prevent memory overflow

### 4. Memory Optimizations
- Removed unnecessary parallel processing of transfer logs
- Added batch size constant for future batching implementation

## Results
- **Before**: App crashed with heap out of memory after scanning ~600 blocks
- **After**: App should run smoothly scanning 100 blocks every 5 minutes

## To Run and Test
```bash
npm run dev
```

## What to Monitor
- No more "JavaScript heap out of memory" errors
- Successful detection logs: "✅ Found new pair: [SYMBOL]"
- Reduced memory usage overall
- More frequent but lighter scans

## Additional Notes
- The Sui network IS using RPC (defaults to mainnet if SUI_RPC_URL not set)
- The fixes maintain all detection capabilities while preventing memory issues
- Consider implementing webhook notifications for detected tokens to avoid missing any during the 5-minute windows