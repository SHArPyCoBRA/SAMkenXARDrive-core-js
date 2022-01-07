import { MAX_BUNDLE_SIZE, MAX_DATA_ITEM_LIMIT } from '../arfs/arfs_upload_planner';
import { ByteCount, UploadOrder } from '../types';

export type BundleIndex = number;

interface BundlePackParams {
	// Upload order can be undefined when a metaData for an over-sized file is packed
	uploadOrder?: UploadOrder;
	byteCountAsDataItem: ByteCount;
	numberOfDataItems: number;
}

export abstract class BundlePacker {
	public bundles: BundleToPack[] = [];

	abstract packIntoBundle(bundlePackParams: BundlePackParams): BundleIndex;
}

/**
 * Pack into lowest index bundle with available size and remaining data items
 *
 * Preserve the BundleIndex for use in edge case where FileData is above MAX_BUNDLE_SIZE
 * but the fileMetaData will still be sent up with a bundle
 */
export class LowestIndexBundlePacker extends BundlePacker {
	constructor(
		private readonly maxBundleSize = MAX_BUNDLE_SIZE,
		private readonly maxDataItemLimit = MAX_DATA_ITEM_LIMIT
	) {
		super();
	}

	packIntoBundle(bundlePackParams: BundlePackParams): BundleIndex {
		const { byteCountAsDataItem, numberOfDataItems } = bundlePackParams;

		for (let index = 0; index < this.bundles.length; index++) {
			const bundle = this.bundles[index];
			// Pack into lowest index bundle that has enough remaining size and data items
			if (+byteCountAsDataItem <= bundle.remainingSize && numberOfDataItems <= bundle.remainingDataItems) {
				bundle.addToBundle(bundlePackParams);
				return index;
			}
		}

		// Otherwise we pack into a new bundle
		this.bundles.push(new BundleToPack(bundlePackParams, this.maxBundleSize, this.maxDataItemLimit));
		return this.bundles.length - 1;
	}
}

class BundleToPack {
	public uploadOrders: UploadOrder[] = [];

	public totalSize = 0;
	public totalDataItems = 0;

	get remainingSize() {
		return this.maxBundleSize - this.totalSize;
	}
	get remainingDataItems() {
		return this.maxDataItemLimit - this.totalDataItems;
	}

	constructor(
		initialBundlePackParams: BundlePackParams,
		private readonly maxBundleSize = MAX_BUNDLE_SIZE,
		private readonly maxDataItemLimit = MAX_DATA_ITEM_LIMIT
	) {
		this.addToBundle(initialBundlePackParams);
	}

	addToBundle({ uploadOrder, byteCountAsDataItem, numberOfDataItems }: BundlePackParams) {
		this.totalSize += +byteCountAsDataItem;
		this.totalDataItems += numberOfDataItems;

		// Metadata of over-sized file uploads can be added without an uploadOrder
		if (uploadOrder) {
			this.uploadOrders.push(uploadOrder);
		}
	}
}
