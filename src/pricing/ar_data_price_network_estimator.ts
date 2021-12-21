import { GatewayOracle } from './gateway_oracle';
import type { ArweaveOracle } from './arweave_oracle';
import { AbstractARDataPriceAndCapacityEstimator } from './ar_data_price_estimator';
import { AR, ByteCount, Winston, ArDriveCommunityTip } from '../types';

const byteCountOfChunk = new ByteCount(Math.pow(2, 10) * 256); // 256 KiB

/**
 * A utility class for Arweave data pricing estimation.
 * Fetches Arweave pricing and caches results based on their chunk size
 */
export class ARDataPriceNetworkEstimator extends AbstractARDataPriceAndCapacityEstimator {
	private bytesToChunks(bytes: ByteCount): number {
		return Math.ceil(+bytes / +byteCountOfChunk);
	}

	private cachedPricePerChunk: { [chunks: string]: Winston } = {};

	/**
	 * Creates a new estimator.
	 *
	 * @param oracle a data source for Arweave data pricing
	 */
	constructor(private readonly oracle: ArweaveOracle = new GatewayOracle()) {
		super();
	}

	/**
	 * Generates a price estimate, in Winston, for an upload of size `byteCount`.
	 *
	 * @param byteCount the number of bytes for which a price estimate should be generated
	 *
	 * @returns Promise for the price of an upload of size `byteCount` in Winston
	 *
	 * @remarks Will use cached price first for a given chunk size
	 *
	 */
	public async getBaseWinstonPriceForByteCount(byteCount: ByteCount): Promise<Winston> {
		const chunks = this.bytesToChunks(byteCount);
		const cachedPrice = this.cachedPricePerChunk[`${chunks}`];

		if (cachedPrice) {
			return cachedPrice;
		}

		const winstonPrice = await this.oracle.getWinstonPriceForByteCount(byteCount);
		this.cachedPricePerChunk[`${chunks}`] = winstonPrice;

		return winstonPrice;
	}

	/**
	 * Estimates the number of bytes that can be stored for a given amount of Winston
	 *
	 * @remarks This method is meant to only be an estimation at this time, do not use to calculate real values!
	 * @remarks The ArDrive community fee is not considered in this estimation
	 */
	public async getByteCountForWinston(winston: Winston): Promise<ByteCount> {
		console.log('winston', winston);
		const baseWinstonPrice = await this.getBaseWinstonPriceForByteCount(new ByteCount(0));
		console.log('baseWinstonPrice', baseWinstonPrice);
		const oneChunkWinstonPrice = await this.getBaseWinstonPriceForByteCount(new ByteCount(1));
		console.log('oneChunkWinstonPrice', oneChunkWinstonPrice);

		if (winston.isGreaterThanOrEqualTo(oneChunkWinstonPrice)) {
			const perChunkEstCost = oneChunkWinstonPrice.minus(baseWinstonPrice);
			console.log('perChunkEstCost', perChunkEstCost);
			const estimatedChunks = Math.floor(
				+winston.minus(baseWinstonPrice).dividedBy(+perChunkEstCost, 'ROUND_DOWN')
			);
			console.log('estimatedChunks', estimatedChunks);

			// (price - base) / perChunkEst

			return new ByteCount(estimatedChunks * +byteCountOfChunk);
		}

		// Return 0 if winston price given does not cover the base winston price for a 1 chunk transaction
		return new ByteCount(0);
	}

	/**
	 * Estimates the number of bytes that can be stored for a given amount of AR
	 *
	 * @remarks Returns 0 bytes when the price does not cover minimum ArDrive community fee
	 */
	public async getByteCountForAR(
		arPrice: AR,
		{ minWinstonFee, tipPercentage }: ArDriveCommunityTip
	): Promise<ByteCount> {
		return super.getByteCountForAR(arPrice, { minWinstonFee, tipPercentage });
	}
}
