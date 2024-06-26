import { Program } from "@coral-xyz/anchor";
import { 
    fetch_with_retry,
    get_account_info, 
    get_token_info, 
} from "./utils/utils";


/**
 * Sorts positions into open and closed
 * @param  {Object[]} position_transactions List of transactions with events
 * @param  {Program} program Anchor Program Instance
 * @param  {String} API_KEY Birdeye API Key
 * @return {Object} Returns an Object containing compiled position data
*/
export async function parse_position_events (
    position_transactions, 
    program,
    open
    ) {
    let position = '' // Address
    let lbPair = ''  // Address
    let final_x = 0; // Withdrawals
    let final_y = 0;
    let initial_x = 0; // Deposits
    let initial_y = 0;
    let fees_y = 0; // Claimed Rewards
    let fees_x = 0;
    let open_time = 0; // Timestamp
    let close_time = Math.floor(Date.now()/1000); // Timestamp
    let position_adjustments = [] // Entries
    let range;

    if(position_transactions[position_transactions.length -1][0].name !== "PositionCreate") {
        return {}
    }

    for(let key in position_transactions) {
        const events = position_transactions[key];
        // console.log(events);
        for (let i in events) {
            const event = events[i]
            let num_x, num_y;
            switch (event.name) {
                case 'AddLiquidity':
                    try{
                        num_x = event.data.amounts[0].toNumber()
                        num_y = event.data.amounts[1].toNumber()
                    }
                    catch(e) {
                        num_x = 0;
                        num_y = 0;
                    }
                    position_adjustments.push({
                        time:event.blocktime,
                        action: 'add liquidity',
                        x_amount: num_x,
                        y_amount: num_y,
                    });

                    initial_x += num_x;
                    initial_y += num_y;
                    continue;
                
                case 'ClaimFee':
                    try{
                        num_x = event.data.feeX.toNumber();
                        num_y = event.data.feeY.toNumber();
                    }
                    catch(e) {
                        num_x = 0;
                        num_y = 0;
                    }
                    position_adjustments.push({
                       time:event.blocktime,
                       action: 'claim fees',
                       x_amount: num_x,
                       y_amount: num_y,
                    });

                    fees_x += num_x;
                    fees_y += num_y;
                    continue;
                    
                case 'RemoveLiquidity':
                    try{
                        num_x = event.data.amounts[0].toNumber()
                        num_y = event.data.amounts[1].toNumber()
                    }
                    catch(e) {
                        num_x = 0;
                        num_y = 0;
                    }
                    position_adjustments.push({
                        time:event.blocktime,
                        action: 'withdraw liquidity',
                        x_amount: num_x,
                        y_amount: num_y,
                        bps: event.bps
                    });
                    final_x += num_x;
                    final_y += num_y;
                    continue;
    
                case 'PositionCreate':
                    // console.log(event);
                    range = event.range
                    position = event.data.position;
                    lbPair = event.data.lbPair;
                    open_time = event.blocktime;
                    continue;
    
                case 'PositionClose':
                    close_time = event.blocktime;     
                    continue;            
                    
                default:
                    // Unhandled Event
                    console.log(`Unexpected event: "${event.name}" encountered while parsing position events`);
                    // console.log(event);
            }
        }
    };
    
    // if(!lbPair) {return null};
    const { 
        tokenXMint, 
        tokenYMint 
    } = await fetch_with_retry(
        get_account_info,
        lbPair, 
        program
    );
    
    const {
        decimals:decimals_x
    } = await fetch_with_retry(
        get_token_info, 
        tokenXMint, 
        program
    );

    const {
        decimals:decimals_y
    } = await fetch_with_retry(
        get_token_info, 
        tokenYMint, 
        program
    );
    
    let days = (close_time - open_time)/86400;
    
    return {
        position,
        days,
        lbPair,
        initial_x,
        initial_y,
        final_x,
        final_y,
        fees_x,
        fees_y,
        open_time,
        close_time,
        decimals_x,
        decimals_y,
        open,
        x_mint : tokenXMint, y_mint: tokenYMint,
        range,
        position_adjustments
    };
};  

/**
 * Compares price array timestamps with target timestamps to find the closest
 * @param  {Object[]} prices List of prices with timestamps
 * @param  {any} time timestamp
 * @return {Object} Returns an Object containing 2 Object arrays of Positions
*/
export const find_nearest_price_to_time = (prices, time) => {
    for(let i = 0; i < prices.length; i++) {
        if(i === prices.length-1) {
            return prices[i-1]
        }
        else if (i === 0) {continue;}
        else if(Number(prices[i].unixTime) <= Number(time) && Number(prices[i+1].unixTime) >= Number(time)) {
            return prices[i]
        }
    };
};


/**
 * Parses an array of positions
 * @param  {Object[]} positions List of positions with events
 * @param  {Program} program Anchor Program Instance
 * @param  {String} API_KEY Birdeye API Key
 * @return {Object[]} Returns an Object array with parsed positions
*/
export const parse_closed_positions = async (
    positions, 
    program, 
    ) => {
    let parsed_positions = [];
    for(let key in positions) {
        parsed_positions.push(
            await parse_position_events(
                positions[key], 
                program, 
                false,
            )
        );
    };
    return parsed_positions;
};

/**
 * Parses an array of positions
 * @param  {Object[]} positions List of positions with events
 * @param  {Program} program Anchor Program Instance
 * @param  {String} API_KEY Birdeye API Key
 * @return {Object[]} Returns an Object array with parsed positions
*/
export const parse_open_positions = async (
    positions, 
    program, 
    ) => {
    let parsed_positions = [];
    for(let key in positions) {
        parsed_positions.push(
            await parse_position_events(
                positions[key], 
                program, 
                true,
            )
        );
    };
    return parsed_positions;
};