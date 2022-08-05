import { Block } from '../generated/schema'

import {BigInt, ethereum} from '@graphprotocol/graph-ts'

export function max(left: BigInt, right: BigInt): BigInt {
  if (left > right) {
    return left
  } else if (right > left) {
    return right
  } else {
    return left
  }
}

export function handleBlock(block: ethereum.Block): void {
  let blockEntity = new Block(block.hash)

  blockEntity.number = block.number
  blockEntity.timestamp = block.timestamp
  blockEntity.size = block.size
  blockEntity.gasUsed = block.gasUsed
  blockEntity.gasLimit = block.gasLimit

  // Confirm that this block is using EIP-1559 type transactions, return early if not
  if (!block.baseFeePerGas) {
    blockEntity.eip1559 = false
    return
  } else {
    blockEntity.eip1559 = true
  }

  blockEntity.baseFeePerGas = block.baseFeePerGas

  // Gas used in block : base gas fee delta to next block
  // 0%   : -%12.5
  // 50%  : 0
  // 100% : +%12.5
  // Set constants
  const BASE_FEE_MAX_CHANGE_DENOMINATOR = BigInt.fromI32(8)
  blockEntity.ecoMaxPriorityFeePerGasRecommended = BigInt.fromI32(1200000000)
  blockEntity.standardMaxPriorityFeePerGasRecommended = BigInt.fromI32(1500000000)
  blockEntity.fastMaxPriorityFeePerGasRecommended = BigInt.fromI32(1800000000)

  // Calculate base fee per gas for next block
  if (block.gasUsed == block.gasLimit) {
    blockEntity.baseFeePerGasExpected = block.baseFeePerGas!
  } else if (block.gasUsed > block.gasLimit) {
    const gasUsedDelta = block.gasUsed.minus(block.gasLimit)
    const baseFeePerGasDelta = max(block.baseFeePerGas!.times(gasUsedDelta).div(block.gasLimit).div(BASE_FEE_MAX_CHANGE_DENOMINATOR), BigInt.fromI32(1))
    blockEntity.baseFeePerGasExpected = block.baseFeePerGas!.plus(baseFeePerGasDelta)
  } else {
    const gasUsedDelta = block.gasLimit.minus(block.gasUsed)
    const baseFeePerGasDelta = block.baseFeePerGas!.times(gasUsedDelta).div(block.gasLimit).div(BASE_FEE_MAX_CHANGE_DENOMINATOR)
    blockEntity.baseFeePerGasExpected = block.baseFeePerGas!.minus(baseFeePerGasDelta)
  }

  // Algorithm similar to what ethersjs uses with addition of speed levels (can be improved if we have access to fee history):
  // https://github.com/ethers-io/ethers.js/blob/master/packages/abstract-provider/src.ts/index.ts#L250-L251
  blockEntity.ecoMaxFeePerGasRecommended = blockEntity.baseFeePerGasExpected!.times(BigInt.fromI32(2)).plus(blockEntity.ecoMaxPriorityFeePerGasRecommended!)
  blockEntity.standardMaxFeePerGasRecommended = blockEntity.baseFeePerGasExpected!.times(BigInt.fromI32(2)).plus(blockEntity.standardMaxPriorityFeePerGasRecommended!)
  blockEntity.fastMaxFeePerGasRecommended = blockEntity.baseFeePerGasExpected!.times(BigInt.fromI32(2)).plus(blockEntity.fastMaxPriorityFeePerGasRecommended!)
  blockEntity.save()
}


// Reference base fee per gas calculations from https://eips.ethereum.org/EIPS/eip-1559

// # check if the base fee is correct
// 		if INITIAL_FORK_BLOCK_NUMBER == block.number:
// 			expected_base_fee_per_gas = INITIAL_BASE_FEE
// 		elif parent_gas_used == parent_gas_target:
// 			expected_base_fee_per_gas = parent_base_fee_per_gas
// 		elif parent_gas_used > parent_gas_target:
// 			gas_used_delta = parent_gas_used - parent_gas_target
// 			base_fee_per_gas_delta = max(parent_base_fee_per_gas * gas_used_delta // parent_gas_target // BASE_FEE_MAX_CHANGE_DENOMINATOR, 1)
// 			expected_base_fee_per_gas = parent_base_fee_per_gas + base_fee_per_gas_delta
// 		else:
// 			gas_used_delta = parent_gas_target - parent_gas_used
// 			base_fee_per_gas_delta = parent_base_fee_per_gas * gas_used_delta // parent_gas_target // BASE_FEE_MAX_CHANGE_DENOMINATOR
// 			expected_base_fee_per_gas = parent_base_fee_per_gas - base_fee_per_gas_delta
// 		assert expected_base_fee_per_gas == block.base_fee_per_gas, 'invalid block: base fee not correct'
