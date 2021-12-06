import Arweave from 'arweave';
import { v4 as uuidv4 } from 'uuid';
import { CreateTransactionInterface } from 'arweave/node/common';
import { JWKInterface } from 'arweave/node/lib/wallet';
import Transaction from 'arweave/node/lib/transaction';
import { ArFSFileOrFolderBuilder } from './arfs_builders/arfs_builders';
import { ArFSPrivateDriveBuilder, SafeArFSDriveBuilder } from './arfs_builders/arfs_drive_builders';
import { ArFSPrivateFileBuilder, ArFSPublicFileBuilder } from './arfs_builders/arfs_file_builders';
import { ArFSPrivateFolderBuilder, ArFSPublicFolderBuilder } from './arfs_builders/arfs_folder_builders';
import {
	ArFSFileOrFolderEntity,
	ArFSPublicDrive,
	ArFSPrivateDrive,
	ArFSPublicFile,
	ArFSPrivateFile,
	ArFSPublicFolder,
	ArFSPrivateFolder,
	ArFSPrivateFileOrFolderWithPaths,
	ENCRYPTED_DATA_PLACEHOLDER
} from './arfs_entities';
import {
	ArFSCreateFolderResult,
	WithDriveKey,
	ArFSCreateDriveResult,
	ArFSCreatePrivateDriveResult,
	ArFSMoveEntityResult,
	ArFSMoveEntityResultFactory,
	ArFSMovePublicFileResult,
	ArFSMovePrivateFileResult,
	ArFSMovePublicFolderResult,
	ArFSMovePrivateFolderResult,
	ArFSUploadFileResult,
	ArFSUploadFileResultFactory,
	ArFSUploadPrivateFileResult,
	ArFSCreateBundledDriveResult,
	ArFSCreatePrivateBundledDriveResult,
	ArFSCreatePublicDriveResult,
	ArFSCreatePublicBundledDriveResult,
	ArFSDriveResult
} from './arfs_entity_result_factory';
import { ArFSEntityToUpload } from './arfs_file_wrapper';
import {
	CreateDriveMetaDataFactory,
	MoveEntityMetaDataFactory,
	FileDataPrototypeFactory,
	FileMetadataTrxDataFactory,
	FileMetaDataFactory
} from './arfs_meta_data_factory';
import {
	ArFSPublicFolderMetaDataPrototype,
	ArFSPrivateFolderMetaDataPrototype,
	ArFSPrivateDriveMetaDataPrototype,
	ArFSPublicFileMetaDataPrototype,
	ArFSPrivateFileMetaDataPrototype,
	ArFSPublicFileDataPrototype,
	ArFSPrivateFileDataPrototype,
	ArFSObjectMetadataPrototype,
	ArFSFolderMetaDataPrototype,
	ArFSDriveMetaDataPrototype,
	ArFSPublicDriveMetaDataPrototype
} from './arfs_prototypes';
import {
	ArFSObjectTransactionData,
	ArFSPublicFolderTransactionData,
	ArFSPrivateFolderTransactionData,
	ArFSPrivateDriveTransactionData,
	ArFSPublicFileMetadataTransactionData,
	ArFSPrivateFileMetadataTransactionData,
	ArFSFileMetadataTransactionData,
	ArFSPublicFileDataTransactionData,
	ArFSPrivateFileDataTransactionData,
	ArFSFolderTransactionData,
	ArFSPublicDriveTransactionData
} from './arfs_trx_data_types';
import { FolderHierarchy } from './folderHierarchy';
import { ArFSAllPublicFoldersOfDriveParams, ArFSDAOAnonymous, graphQLURL } from './arfsdao_anonymous';
import { DEFAULT_APP_NAME, DEFAULT_APP_VERSION, CURRENT_ARFS_VERSION } from '../utils/constants';
import { deriveDriveKey, driveDecrypt } from '../utils/crypto';
import { PrivateKeyData } from './private_key_data';
import {
	EID,
	ArweaveAddress,
	TxID,
	W,
	GQLTagInterface,
	GQLEdgeInterface,
	GQLNodeInterface,
	DrivePrivacy,
	ListPrivateFolderParams,
	DriveID,
	DriveKey,
	FolderID,
	RewardSettings,
	FileID
} from '../types';
import { latestRevisionFilter, fileFilter, folderFilter } from '../utils/filter_methods';
import {
	entityToNameMap,
	NameConflictInfo,
	fileConflictInfoMap,
	folderToNameAndIdMap
} from '../utils/mapper_functions';
import { buildQuery, ASCENDING_ORDER } from '../utils/query';
import { Wallet } from '../wallet';
import { JWKWallet } from '../jwk_wallet';
import { bundleAndSignData, createData, DataItem } from 'arbundles';
import { ArweaveSigner } from 'arbundles/src/signing';

export class PrivateDriveKeyData {
	private constructor(readonly driveId: DriveID, readonly driveKey: DriveKey) {}

	static async from(drivePassword: string, privateKey: JWKInterface): Promise<PrivateDriveKeyData> {
		const driveId = uuidv4();
		const driveKey = await deriveDriveKey(drivePassword, driveId, JSON.stringify(privateKey));
		return new PrivateDriveKeyData(EID(driveId), driveKey);
	}
}

type PrepareArFSObject<T, U extends ArFSObjectMetadataPrototype> = (metaDataPrototype: U) => Promise<T>;

export interface ArFSPrepareDriveParams<T> {
	generateDriveIdFn: GenerateDriveIdFn;
	drivePrototypeFactory: CreateDriveMetaDataFactory;
	rootFolderPrototypeFactory: (rootFolderId: FolderID, driveId: DriveID) => ArFSFolderMetaDataPrototype;
	prepareArFSObject: PrepareArFSObject<T, ArFSFolderMetaDataPrototype | ArFSDriveMetaDataPrototype>;
}

interface ArFSPrepareResult<T> {
	arFSObjects: T[];
}
interface ArFSPrepareFolderResult<T> extends ArFSPrepareResult<T> {
	folderId: FolderID;
}

export interface ArFSPrepareDriveResult<T> extends ArFSPrepareResult<T> {
	rootFolderId: FolderID;
	driveId: DriveID;
}

export interface ArFSPrepareFolderParams<T> {
	folderPrototypeFactory: (folderId: FolderID) => ArFSFolderMetaDataPrototype;
	prepareArFSObject: PrepareArFSObject<T, ArFSFolderMetaDataPrototype>;
}

export interface ArFSCreateFolderParams<T extends ArFSFolderTransactionData> {
	driveId: DriveID;
	rewardSettings: RewardSettings;
	parentFolderId: FolderID;
	folderData: T;
}

export type ArFSPublicCreateFolderParams = ArFSCreateFolderParams<ArFSPublicFolderTransactionData>;
export type ArFSPrivateCreateFolderParams = ArFSCreateFolderParams<ArFSPrivateFolderTransactionData>;

export interface ArFSCreatePublicDriveParams {
	driveName: string;
	driveRewardSettings: RewardSettings;
	rootFolderRewardSettings: RewardSettings;
}
export interface ArFSCreatePrivateDriveParams extends ArFSCreatePublicDriveParams {
	newDriveData: PrivateDriveKeyData;
}

/** Shared result type for createBundledDrive and createV2TxDrive */
export type ArFSDriveTxResult<R extends ArFSDriveResult> = {
	result: R;
	transactions: Transaction[];
};

export interface PrepareObjectTransactionParams {
	objectMetaData: ArFSObjectMetadataPrototype;
	rewardSettings?: RewardSettings;
	excludedTagNames?: string[];
	otherTags?: GQLTagInterface[];
}

export interface ArFSMoveParams<O extends ArFSFileOrFolderEntity, T extends ArFSObjectTransactionData> {
	originalMetaData: O;
	newParentFolderId: FolderID;
	metaDataBaseReward: RewardSettings;
	transactionData: T;
}

export type GetDriveFunction = () => Promise<ArFSPublicDrive | ArFSPrivateDrive>;
export type CreateFolderFunction = (driveId: DriveID) => Promise<ArFSCreateFolderResult>;
export type GenerateDriveIdFn = () => DriveID;

export type ArFSListPrivateFolderParams = Required<ListPrivateFolderParams>;

export interface ArFSUploadPublicFileParams {
	parentFolderId: FolderID;
	wrappedFile: ArFSEntityToUpload;
	driveId: DriveID;
	fileDataRewardSettings: RewardSettings;
	metadataRewardSettings: RewardSettings;
	destFileName?: string;
	existingFileId?: FileID;
}

export interface ArFSUploadPrivateFileParams extends ArFSUploadPublicFileParams {
	driveKey: DriveKey;
}

export type ArFSAllPrivateFoldersOfDriveParams = ArFSAllPublicFoldersOfDriveParams & WithDriveKey;

interface getPublicChildrenFolderIdsParams {
	folderId: FolderID;
	driveId: DriveID;
	owner: ArweaveAddress;
}
interface getPrivateChildrenFolderIdsParams extends getPublicChildrenFolderIdsParams {
	driveKey: DriveKey;
}

export class ArFSDAO extends ArFSDAOAnonymous {
	// TODO: Can we abstract Arweave type(s)?
	constructor(
		private readonly wallet: Wallet,
		arweave: Arweave,
		private readonly dryRun = false,
		protected appName = DEFAULT_APP_NAME,
		protected appVersion = DEFAULT_APP_VERSION,
		private readonly bundle = true
	) {
		super(arweave, appName, appVersion);
	}

	/** Prepare an ArFS folder entity for upload */
	private async prepareFolder<T>({
		folderPrototypeFactory,
		prepareArFSObject
	}: ArFSPrepareFolderParams<T>): Promise<ArFSPrepareFolderResult<T>> {
		// Generate a new folder ID
		const folderId = EID(uuidv4());

		// Create a folder metadata transaction
		const folderMetadata = folderPrototypeFactory(folderId);

		// Prepare the ArFS folder transaction or dataItem
		const arFSObjects = [await prepareArFSObject(folderMetadata)];

		return { arFSObjects, folderId };
	}

	/** Create a single folder as a V2 transaction */
	private async createFolder(
		folderPrototypeFactory: (folderId: FolderID) => ArFSFolderMetaDataPrototype,
		rewardSettings: RewardSettings
	): Promise<ArFSCreateFolderResult> {
		const { arFSObjects, folderId } = await this.prepareFolder({
			folderPrototypeFactory,
			prepareArFSObject: (folderMetaData) =>
				this.prepareArFSObjectTransaction({ objectMetaData: folderMetaData, rewardSettings })
		});
		const folderTrx = arFSObjects[0];

		await this.sendTransactionsAsChunks([folderTrx]);

		return { metaDataTrxId: TxID(folderTrx.id), metaDataTrxReward: W(folderTrx.reward), folderId };
	}

	/** Create a single private folder as a V2 transaction */
	public async createPrivateFolder({
		driveId,
		rewardSettings,
		parentFolderId,
		folderData
	}: ArFSPrivateCreateFolderParams): Promise<ArFSCreateFolderResult> {
		return this.createFolder(
			(folderId) => new ArFSPrivateFolderMetaDataPrototype(driveId, folderId, folderData, parentFolderId),
			rewardSettings
		);
	}

	/** Create a single public folder as a V2 transaction */
	public async createPublicFolder({
		driveId,
		rewardSettings,
		parentFolderId,
		folderData
	}: ArFSPublicCreateFolderParams): Promise<ArFSCreateFolderResult> {
		return this.createFolder(
			(folderId) => new ArFSPublicFolderMetaDataPrototype(folderData, driveId, folderId, parentFolderId),
			rewardSettings
		);
	}

	/** Prepare an ArFS drive entity for upload */
	private async prepareDrive<T>({
		drivePrototypeFactory,
		prepareArFSObject,
		rootFolderPrototypeFactory,
		generateDriveIdFn
	}: ArFSPrepareDriveParams<T>): Promise<ArFSPrepareDriveResult<T>> {
		// Generate a new drive ID for the new drive
		const driveId = generateDriveIdFn();

		// Create ArFS root folder object
		const { arFSObjects, folderId: rootFolderId } = await this.prepareFolder({
			folderPrototypeFactory: (folderId) => rootFolderPrototypeFactory(folderId, driveId),
			prepareArFSObject
		});
		const rootFolderArFSObject = arFSObjects[0];

		// Create ArFS drive object
		const driveMetaData = await drivePrototypeFactory(driveId, rootFolderId);
		const driveArFSObject = await prepareArFSObject(driveMetaData);

		return { arFSObjects: [rootFolderArFSObject, driveArFSObject], driveId, rootFolderId };
	}

	/** Create drive and root folder together as bundled transaction */
	private async createBundledDrive(
		sharedPrepDriveParams: Omit<ArFSPrepareDriveParams<DataItem>, 'prepareArFSObject'>,
		rewardSettings: RewardSettings
	): Promise<ArFSDriveTxResult<ArFSCreateBundledDriveResult>> {
		const { arFSObjects, driveId, rootFolderId } = await this.prepareDrive({
			...sharedPrepDriveParams,
			prepareArFSObject: (objectMetaData) =>
				this.prepareArFSDataItem({
					objectMetaData
				})
		});

		// Pack data items into a bundle
		const bundledTrx = await this.prepareArFSObjectBundle({ dataItems: arFSObjects, rewardSettings });

		const [rootFolderDataItem, driveDataItem] = arFSObjects;
		return {
			transactions: [bundledTrx],
			result: {
				bundleTrxId: TxID(bundledTrx.id),
				bundleTrxReward: W(bundledTrx.reward),
				driveId,
				metaDataTrxId: TxID(driveDataItem.id),
				rootFolderId,
				rootFolderTrxId: TxID(rootFolderDataItem.id)
			}
		};
	}

	/** Create drive and root folder as separate V2 transactions */
	private async createV2TxDrive(
		sharedPrepDriveParams: Omit<ArFSPrepareDriveParams<Transaction>, 'prepareArFSObject'>,
		driveRewardSettings: RewardSettings,
		rootFolderRewardSettings: RewardSettings
	): Promise<ArFSDriveTxResult<ArFSCreateDriveResult>> {
		const { arFSObjects, driveId, rootFolderId } = await this.prepareDrive({
			...sharedPrepDriveParams,
			prepareArFSObject: (objectMetaData) =>
				this.prepareArFSObjectTransaction({
					objectMetaData,
					rewardSettings:
						// Type-check the metadata to conditionally pass correct reward setting
						objectMetaData instanceof ArFSDriveMetaDataPrototype
							? driveRewardSettings
							: rootFolderRewardSettings
				})
		});

		const [rootFolderTrx, driveTrx] = arFSObjects;
		return {
			transactions: arFSObjects,
			result: {
				metaDataTrxId: TxID(driveTrx.id),
				metaDataTrxReward: W(driveTrx.reward),
				driveId,
				rootFolderId,
				rootFolderTrxId: TxID(rootFolderTrx.id),
				rootFolderTrxReward: W(rootFolderTrx.reward)
			}
		};
	}

	/**
	 * Create drive and root folder as a V2 transaction OR a bundled transaction
	 *
	 * @remarks Result type is determined by ArFSDAO class setting `bundle`
	 */
	private async createDrive(
		sharedPrepDriveParams: Omit<ArFSPrepareDriveParams<Transaction | DataItem>, 'prepareArFSObject'>,
		driveRewardSettings: RewardSettings,
		rootFolderRewardSettings: RewardSettings
	): Promise<ArFSCreateDriveResult | ArFSCreateBundledDriveResult> {
		const { transactions, result } = this.bundle
			? await this.createBundledDrive(sharedPrepDriveParams, driveRewardSettings)
			: await this.createV2TxDrive(sharedPrepDriveParams, driveRewardSettings, rootFolderRewardSettings);

		// Upload all v2 transactions or bundles
		await this.sendTransactionsAsChunks(transactions);
		return result;
	}

	/** Create an ArFS public drive */
	public async createPublicDrive({
		driveName,
		driveRewardSettings,
		rootFolderRewardSettings
	}: ArFSCreatePublicDriveParams): Promise<ArFSCreatePublicDriveResult | ArFSCreatePublicBundledDriveResult> {
		const folderData = new ArFSPublicFolderTransactionData(driveName);
		const prepPublicDriveParams = {
			rootFolderPrototypeFactory: (folderId: FolderID, driveId: DriveID) =>
				new ArFSPublicFolderMetaDataPrototype(folderData, driveId, folderId),
			generateDriveIdFn: () => EID(uuidv4()),
			drivePrototypeFactory: async (driveId: DriveID, rootFolderId: FolderID) =>
				Promise.resolve(
					new ArFSPublicDriveMetaDataPrototype(
						new ArFSPublicDriveTransactionData(driveName, rootFolderId),
						driveId
					)
				)
		};

		return this.createDrive(prepPublicDriveParams, driveRewardSettings, rootFolderRewardSettings);
	}

	/** Create an ArFS private drive */
	public async createPrivateDrive({
		driveName,
		driveRewardSettings,
		rootFolderRewardSettings,
		newDriveData
	}: ArFSCreatePrivateDriveParams): Promise<ArFSCreatePrivateDriveResult | ArFSCreatePrivateBundledDriveResult> {
		const folderData = await ArFSPrivateFolderTransactionData.from(driveName, newDriveData.driveKey);
		const prepPrivateDriveParams = {
			rootFolderPrototypeFactory: (folderId: FolderID, driveId: DriveID) =>
				new ArFSPrivateFolderMetaDataPrototype(driveId, folderId, folderData),
			generateDriveIdFn: () => newDriveData.driveId,
			drivePrototypeFactory: async (driveId: DriveID, rootFolderId: FolderID) =>
				Promise.resolve(
					new ArFSPrivateDriveMetaDataPrototype(
						driveId,
						await ArFSPrivateDriveTransactionData.from(driveName, rootFolderId, newDriveData.driveKey)
					)
				)
		};

		return {
			...(await this.createDrive(prepPrivateDriveParams, driveRewardSettings, rootFolderRewardSettings)),
			driveKey: folderData.driveKey
		};
	}

	async moveEntity<R extends ArFSMoveEntityResult>(
		metaDataBaseReward: RewardSettings,
		metaDataFactory: MoveEntityMetaDataFactory,
		resultFactory: ArFSMoveEntityResultFactory<R>
	): Promise<R> {
		const metadataPrototype = metaDataFactory();

		// Prepare meta data transaction
		const metaDataTrx = await this.prepareArFSObjectTransaction({
			objectMetaData: metadataPrototype,
			rewardSettings: metaDataBaseReward
		});

		// Upload meta data
		if (!this.dryRun) {
			const metaDataUploader = await this.arweave.transactions.getUploader(metaDataTrx);
			while (!metaDataUploader.isComplete) {
				await metaDataUploader.uploadChunk();
			}
		}

		return resultFactory({ metaDataTrxId: TxID(metaDataTrx.id), metaDataTrxReward: W(metaDataTrx.reward) });
	}

	async movePublicFile({
		metaDataBaseReward,
		originalMetaData,
		transactionData,
		newParentFolderId
	}: ArFSMoveParams<ArFSPublicFile, ArFSPublicFileMetadataTransactionData>): Promise<ArFSMovePublicFileResult> {
		return this.moveEntity<ArFSMovePublicFileResult>(
			metaDataBaseReward,
			() => {
				return new ArFSPublicFileMetaDataPrototype(
					transactionData,
					originalMetaData.driveId,
					originalMetaData.fileId,
					newParentFolderId
				);
			},
			(results) => {
				return { ...results, dataTrxId: originalMetaData.dataTxId };
			}
		);
	}

	async movePrivateFile({
		metaDataBaseReward,
		originalMetaData,
		transactionData,
		newParentFolderId
	}: ArFSMoveParams<ArFSPrivateFile, ArFSPrivateFileMetadataTransactionData>): Promise<ArFSMovePrivateFileResult> {
		return this.moveEntity<ArFSMovePrivateFileResult>(
			metaDataBaseReward,
			() => {
				return new ArFSPrivateFileMetaDataPrototype(
					transactionData,
					originalMetaData.driveId,
					originalMetaData.fileId,
					newParentFolderId
				);
			},
			(results) => {
				return { ...results, dataTrxId: originalMetaData.dataTxId, fileKey: transactionData.fileKey };
			}
		);
	}

	async movePublicFolder({
		metaDataBaseReward,
		originalMetaData,
		transactionData,
		newParentFolderId
	}: ArFSMoveParams<ArFSPublicFolder, ArFSPublicFolderTransactionData>): Promise<ArFSMovePublicFolderResult> {
		return this.moveEntity<ArFSMovePublicFolderResult>(
			metaDataBaseReward,
			() => {
				return new ArFSPublicFolderMetaDataPrototype(
					transactionData,
					originalMetaData.driveId,
					originalMetaData.entityId,
					newParentFolderId
				);
			},
			(results) => results
		);
	}

	async movePrivateFolder({
		metaDataBaseReward,
		originalMetaData,
		transactionData,
		newParentFolderId
	}: ArFSMoveParams<ArFSPrivateFolder, ArFSPrivateFolderTransactionData>): Promise<ArFSMovePrivateFolderResult> {
		return this.moveEntity<ArFSMovePrivateFolderResult>(
			metaDataBaseReward,
			() => {
				return new ArFSPrivateFolderMetaDataPrototype(
					originalMetaData.driveId,
					originalMetaData.entityId,
					transactionData,
					newParentFolderId
				);
			},
			(results) => {
				return { ...results, driveKey: transactionData.driveKey };
			}
		);
	}

	async uploadFile<R extends ArFSUploadFileResult, D extends ArFSFileMetadataTransactionData>(
		wrappedFile: ArFSEntityToUpload,
		fileDataRewardSettings: RewardSettings,
		metadataRewardSettings: RewardSettings,
		dataPrototypeFactoryFn: FileDataPrototypeFactory,
		metadataTrxDataFactoryFn: FileMetadataTrxDataFactory<D>,
		metadataFactoryFn: FileMetaDataFactory<D>,
		resultFactoryFn: ArFSUploadFileResultFactory<R, D>,
		destFileName?: string,
		existingFileId?: FileID
	): Promise<R> {
		// Establish destination file name
		const destinationFileName = destFileName ?? wrappedFile.getBaseFileName();

		// Use existing file ID (create a revision) or generate new file ID
		const fileId = existingFileId ?? EID(uuidv4());

		// Gather file information
		const { fileSize, dataContentType, lastModifiedDateMS } = wrappedFile.gatherFileInfo();

		// Read file data into memory
		const fileData = wrappedFile.getFileDataBuffer();

		// Build file data transaction
		const fileDataPrototype = await dataPrototypeFactoryFn(fileData, dataContentType, fileId);
		const dataTrx = await this.prepareArFSObjectTransaction({
			objectMetaData: fileDataPrototype,
			rewardSettings: fileDataRewardSettings,
			excludedTagNames: ['ArFS']
		});

		// Upload file data
		if (!this.dryRun) {
			const dataUploader = await this.arweave.transactions.getUploader(dataTrx);
			while (!dataUploader.isComplete) {
				await dataUploader.uploadChunk();
			}
		}

		// Prepare meta data transaction
		const metadataTrxData = await metadataTrxDataFactoryFn(
			destinationFileName,
			fileSize,
			lastModifiedDateMS,
			TxID(dataTrx.id),
			dataContentType,
			fileId
		);
		const fileMetadata = metadataFactoryFn(metadataTrxData, fileId);
		const metaDataTrx = await this.prepareArFSObjectTransaction({
			objectMetaData: fileMetadata,
			rewardSettings: metadataRewardSettings
		});

		// Upload meta data
		if (!this.dryRun) {
			const metaDataUploader = await this.arweave.transactions.getUploader(metaDataTrx);
			while (!metaDataUploader.isComplete) {
				await metaDataUploader.uploadChunk();
			}
		}

		return resultFactoryFn(
			{
				dataTrxId: TxID(dataTrx.id),
				dataTrxReward: W(dataTrx.reward),
				metaDataTrxId: TxID(metaDataTrx.id),
				metaDataTrxReward: W(metaDataTrx.reward),
				fileId
			},
			metadataTrxData
		);
	}

	async uploadPublicFile({
		parentFolderId,
		wrappedFile,
		driveId,
		fileDataRewardSettings,
		metadataRewardSettings,
		destFileName,
		existingFileId
	}: ArFSUploadPublicFileParams): Promise<ArFSUploadFileResult> {
		return this.uploadFile(
			wrappedFile,
			fileDataRewardSettings,
			metadataRewardSettings,
			async (fileData, dataContentType) => {
				return new ArFSPublicFileDataPrototype(
					new ArFSPublicFileDataTransactionData(fileData),
					dataContentType
				);
			},
			async (destinationFileName, fileSize, lastModifiedDateMS, dataTrxId, dataContentType) => {
				return new ArFSPublicFileMetadataTransactionData(
					destinationFileName,
					fileSize,
					lastModifiedDateMS,
					dataTrxId,
					dataContentType
				);
			},
			(metadataTrxData, fileId) => {
				return new ArFSPublicFileMetaDataPrototype(metadataTrxData, driveId, fileId, parentFolderId);
			},
			(result) => result, // no change
			destFileName,
			existingFileId
		);
	}

	async uploadPrivateFile({
		parentFolderId,
		wrappedFile,
		driveId,
		driveKey,
		fileDataRewardSettings,
		metadataRewardSettings,
		destFileName,
		existingFileId
	}: ArFSUploadPrivateFileParams): Promise<ArFSUploadPrivateFileResult> {
		return this.uploadFile(
			wrappedFile,
			fileDataRewardSettings,
			metadataRewardSettings,
			async (fileData, _dataContentType, fileId) => {
				const trxData = await ArFSPrivateFileDataTransactionData.from(fileData, fileId, driveKey);
				return new ArFSPrivateFileDataPrototype(trxData);
			},
			async (destinationFileName, fileSize, lastModifiedDateMS, dataTrxId, dataContentType, fileId) => {
				return await ArFSPrivateFileMetadataTransactionData.from(
					destinationFileName,
					fileSize,
					lastModifiedDateMS,
					dataTrxId,
					dataContentType,
					fileId,
					driveKey
				);
			},
			(metadataTrxData, fileId) => {
				return new ArFSPrivateFileMetaDataPrototype(metadataTrxData, driveId, fileId, parentFolderId);
			},
			(result, trxData) => {
				return { ...result, fileKey: trxData.fileKey }; // add the file key to the result data
			},
			destFileName,
			existingFileId
		);
	}

	get baselineArFSTags(): GQLTagInterface[] {
		return [
			{ name: 'App-Name', value: this.appName },
			{ name: 'App-Version', value: this.appVersion },
			{ name: 'ArFS', value: CURRENT_ARFS_VERSION }
		];
	}

	async prepareArFSDataItem({
		objectMetaData,
		excludedTagNames = [],
		otherTags = []
	}: Omit<PrepareObjectTransactionParams, 'rewardSettings'>): Promise<DataItem> {
		// Enforce that other tags are not protected
		objectMetaData.assertProtectedTags(otherTags);

		const tags = [...this.baselineArFSTags, ...objectMetaData.gqlTags, ...otherTags].filter(
			// Filter out all excluded tags
			(tag) => !excludedTagNames.includes(tag.name)
		);

		const signer = new ArweaveSigner((this.wallet as JWKWallet).getPrivateKey());

		// Sign the data item
		const dataItem = createData(objectMetaData.objectData.asTransactionData(), signer, { tags });
		await dataItem.sign(signer);

		return dataItem;
	}

	async prepareArFSObjectBundle({
		dataItems,
		rewardSettings = {},
		excludedTagNames = [],
		otherTags = []
	}: Omit<PrepareObjectTransactionParams, 'objectMetaData'> & { dataItems: DataItem[] }): Promise<Transaction> {
		const wallet = this.wallet as JWKWallet;
		const signer = new ArweaveSigner(wallet.getPrivateKey());

		const bundle = await bundleAndSignData(dataItems, signer);

		// Verify the bundle and dataItems
		if (!(await bundle.verify())) {
			throw new Error('Bundle format could not be verified!');
		}

		// We use arweave directly to create our transaction so we can assign our own reward and skip network request
		const bundledDataTx = await this.arweave.createTransaction({
			data: bundle.getRaw(),
			// If we provided our own reward setting, use it now
			reward: rewardSettings.reward ? rewardSettings.reward.toString() : undefined,
			// TODO: Use a mock arweave server instead
			last_tx: process.env.NODE_ENV === 'test' ? 'STUB' : undefined
		});

		const tags: GQLTagInterface[] = [
			...this.baselineArFSTags,
			...otherTags,
			{ name: 'Bundle-Format', value: 'binary' },
			{ name: 'Bundle-Version', value: '2.0.0' }
		];

		// If we've opted to boost the transaction, do so now
		if (rewardSettings.feeMultiple?.wouldBoostReward()) {
			bundledDataTx.reward = rewardSettings.feeMultiple.boostReward(bundledDataTx.reward);

			// Add a Boost tag
			tags.push({ name: 'Boost', value: rewardSettings.feeMultiple.toString() });
		}

		tags.filter(
			// Filter out all excluded tags, bundles dont include ArFS tag by default
			(tag) => ![...excludedTagNames, 'ArFS'].includes(tag.name)
		).forEach((tag) => {
			// Add remaining tags to transaction
			bundledDataTx.addTag(tag.name, tag.value);
		});

		await this.arweave.transactions.sign(bundledDataTx, wallet.getPrivateKey());

		return bundledDataTx;
	}

	async prepareArFSObjectTransaction({
		objectMetaData,
		rewardSettings = {},
		excludedTagNames = [],
		otherTags = []
	}: PrepareObjectTransactionParams): Promise<Transaction> {
		// Enforce that other tags are not protected
		objectMetaData.assertProtectedTags(otherTags);
		const tags = [...this.baselineArFSTags, ...objectMetaData.gqlTags, ...otherTags];

		// Create transaction
		const trxAttributes: Partial<CreateTransactionInterface> = {
			data: objectMetaData.objectData.asTransactionData()
		};

		// If we provided our own reward setting, use it now
		if (rewardSettings.reward) {
			trxAttributes.reward = rewardSettings.reward.toString();
		}

		// TODO: Use a mock arweave server instead
		if (process.env.NODE_ENV === 'test') {
			trxAttributes.last_tx = 'STUB';
		}

		const wallet = this.wallet as JWKWallet;
		const transaction = await this.arweave.createTransaction(trxAttributes, wallet.getPrivateKey());

		// If we've opted to boost the transaction, do so now
		if (rewardSettings.feeMultiple?.wouldBoostReward()) {
			transaction.reward = rewardSettings.feeMultiple.boostReward(transaction.reward);

			// Add a Boost tag
			tags.push({ name: 'Boost', value: rewardSettings.feeMultiple.toString() });
		}

		tags.filter(
			// Filter out all excluded tags
			(tag) => !excludedTagNames.includes(tag.name)
		).forEach((tag) => {
			// Add remaining tags to transaction
			transaction.addTag(tag.name, tag.value);
		});

		// Sign the transaction
		await this.arweave.transactions.sign(transaction, wallet.getPrivateKey());
		return transaction;
	}

	async sendTransactionsAsChunks(transactions: Transaction[]): Promise<void> {
		// Execute the uploads
		if (!this.dryRun) {
			await Promise.all(
				transactions.map(async (transaction) => {
					const driveUploader = await this.arweave.transactions.getUploader(transaction);
					while (!driveUploader.isComplete) {
						await driveUploader.uploadChunk();
					}
				})
			);
		}
	}

	// Convenience function for known-private use cases
	async getPrivateDrive(driveId: DriveID, driveKey: DriveKey, owner: ArweaveAddress): Promise<ArFSPrivateDrive> {
		return new ArFSPrivateDriveBuilder({ entityId: driveId, arweave: this.arweave, key: driveKey, owner }).build();
	}

	// Convenience function for known-private use cases
	async getPrivateFolder(folderId: FolderID, driveKey: DriveKey, owner: ArweaveAddress): Promise<ArFSPrivateFolder> {
		return new ArFSPrivateFolderBuilder(folderId, this.arweave, driveKey, owner).build();
	}

	async getPrivateFile(fileId: FileID, driveKey: DriveKey, owner: ArweaveAddress): Promise<ArFSPrivateFile> {
		return new ArFSPrivateFileBuilder(fileId, this.arweave, driveKey, owner).build();
	}

	async getAllFoldersOfPrivateDrive({
		driveId,
		driveKey,
		owner,
		latestRevisionsOnly = false
	}: ArFSAllPrivateFoldersOfDriveParams): Promise<ArFSPrivateFolder[]> {
		let cursor = '';
		let hasNextPage = true;
		const allFolders: ArFSPrivateFolder[] = [];

		while (hasNextPage) {
			const gqlQuery = buildQuery({
				tags: [
					{ name: 'Drive-Id', value: `${driveId}` },
					{ name: 'Entity-Type', value: 'folder' }
				],
				cursor,
				owner
			});

			const response = await this.arweave.api.post(graphQLURL, gqlQuery);
			const { data } = response.data;
			const { transactions } = data;
			const { edges } = transactions;
			hasNextPage = transactions.pageInfo.hasNextPage;

			const folders: Promise<ArFSPrivateFolder>[] = edges.map(async (edge: GQLEdgeInterface) => {
				cursor = edge.cursor;
				const { node } = edge;
				const folderBuilder = await ArFSPrivateFolderBuilder.fromArweaveNode(node, this.arweave, driveKey);
				return await folderBuilder.build(node);
			});
			allFolders.push(...(await Promise.all(folders)));
		}
		return latestRevisionsOnly ? allFolders.filter(latestRevisionFilter) : allFolders;
	}

	async getPrivateFilesWithParentFolderIds(
		folderIDs: FolderID[],
		driveKey: DriveKey,
		owner: ArweaveAddress,
		latestRevisionsOnly = false
	): Promise<ArFSPrivateFile[]> {
		let cursor = '';
		let hasNextPage = true;
		const allFiles: ArFSPrivateFile[] = [];

		while (hasNextPage) {
			const gqlQuery = buildQuery({
				tags: [
					{ name: 'Parent-Folder-Id', value: folderIDs.map((fid) => fid.toString()) },
					{ name: 'Entity-Type', value: 'file' }
				],
				cursor,
				owner
			});

			const response = await this.arweave.api.post(graphQLURL, gqlQuery);
			const { data } = response.data;
			const { transactions } = data;
			const { edges } = transactions;
			hasNextPage = transactions.pageInfo.hasNextPage;
			const files: Promise<ArFSPrivateFile>[] = edges.map(async (edge: GQLEdgeInterface) => {
				const { node } = edge;
				cursor = edge.cursor;
				const fileBuilder = await ArFSPrivateFileBuilder.fromArweaveNode(node, this.arweave, driveKey);
				return await fileBuilder.build(node);
			});
			allFiles.push(...(await Promise.all(files)));
		}
		return latestRevisionsOnly ? allFiles.filter(latestRevisionFilter) : allFiles;
	}

	async getEntitiesInFolder(
		parentFolderId: FolderID,
		builder: (
			node: GQLNodeInterface,
			entityType: 'file' | 'folder'
		) => ArFSFileOrFolderBuilder<ArFSFileOrFolderEntity>,
		latestRevisionsOnly = true,
		filterOnOwner = true
	): Promise<ArFSFileOrFolderEntity[]> {
		let cursor = '';
		let hasNextPage = true;
		const allEntities: ArFSFileOrFolderEntity[] = [];

		// TODO: Derive the owner of a wallet from earliest transaction of a drive by default
		const owner = await this.wallet.getAddress();

		while (hasNextPage) {
			const gqlQuery = buildQuery({
				tags: [
					{ name: 'Parent-Folder-Id', value: `${parentFolderId}` },
					{ name: 'Entity-Type', value: ['file', 'folder'] }
				],
				cursor,
				owner: filterOnOwner ? owner : undefined
			});

			const response = await this.arweave.api.post(graphQLURL, gqlQuery);
			const { data } = response.data;
			const { transactions } = data;
			const { edges } = transactions;
			hasNextPage = transactions.pageInfo.hasNextPage;

			const folders: Promise<ArFSFileOrFolderEntity>[] = edges.map(async (edge: GQLEdgeInterface) => {
				const { node } = edge;
				cursor = edge.cursor;
				const { tags } = node;

				// Check entityType to determine which builder to use
				const entityType = tags.find((t) => t.name === 'Entity-Type')?.value;
				if (!entityType || (entityType !== 'file' && entityType !== 'folder')) {
					throw new Error('Entity-Type tag is missing or invalid!');
				}

				return builder(node, entityType).build(node);
			});

			allEntities.push(...(await Promise.all(folders)));
		}
		return latestRevisionsOnly ? allEntities.filter(latestRevisionFilter) : allEntities;
	}

	async getPrivateEntitiesInFolder(
		parentFolderId: FolderID,
		driveKey: DriveKey,
		latestRevisionsOnly = true
	): Promise<ArFSFileOrFolderEntity[]> {
		return this.getEntitiesInFolder(
			parentFolderId,
			(node, entityType) =>
				entityType === 'folder'
					? ArFSPrivateFolderBuilder.fromArweaveNode(node, this.arweave, driveKey)
					: ArFSPrivateFileBuilder.fromArweaveNode(node, this.arweave, driveKey),
			latestRevisionsOnly
		);
	}

	async getPublicEntitiesInFolder(
		parentFolderId: FolderID,
		latestRevisionsOnly = true
	): Promise<ArFSFileOrFolderEntity[]> {
		return this.getEntitiesInFolder(
			parentFolderId,
			(node, entityType) =>
				entityType === 'folder'
					? ArFSPublicFolderBuilder.fromArweaveNode(node, this.arweave)
					: ArFSPublicFileBuilder.fromArweaveNode(node, this.arweave),
			latestRevisionsOnly
		);
	}

	async getChildrenFolderIds(
		folderId: FolderID,
		allFolderEntitiesOfDrive: ArFSFileOrFolderEntity[]
	): Promise<FolderID[]> {
		const hierarchy = FolderHierarchy.newFromEntities(allFolderEntitiesOfDrive);
		return hierarchy.folderIdSubtreeFromFolderId(folderId, Number.MAX_SAFE_INTEGER);
	}

	async getPrivateEntityNamesInFolder(folderId: FolderID, driveKey: DriveKey): Promise<string[]> {
		const childrenOfFolder = await this.getPrivateEntitiesInFolder(folderId, driveKey, true);
		return childrenOfFolder.map(entityToNameMap);
	}

	async getPublicEntityNamesInFolder(folderId: FolderID): Promise<string[]> {
		const childrenOfFolder = await this.getPublicEntitiesInFolder(folderId, true);
		return childrenOfFolder.map(entityToNameMap);
	}

	async getPublicNameConflictInfoInFolder(folderId: FolderID): Promise<NameConflictInfo> {
		const childrenOfFolder = await this.getPublicEntitiesInFolder(folderId, true);
		return {
			files: childrenOfFolder.filter(fileFilter).map(fileConflictInfoMap),
			folders: childrenOfFolder.filter(folderFilter).map(folderToNameAndIdMap)
		};
	}

	async getPrivateNameConflictInfoInFolder(folderId: FolderID, driveKey: DriveKey): Promise<NameConflictInfo> {
		const childrenOfFolder = await this.getPrivateEntitiesInFolder(folderId, driveKey, true);
		return {
			files: childrenOfFolder.filter(fileFilter).map(fileConflictInfoMap),
			folders: childrenOfFolder.filter(folderFilter).map(folderToNameAndIdMap)
		};
	}

	async getPrivateChildrenFolderIds({
		folderId,
		driveId,
		driveKey,
		owner
	}: getPrivateChildrenFolderIdsParams): Promise<FolderID[]> {
		return this.getChildrenFolderIds(
			folderId,
			await this.getAllFoldersOfPrivateDrive({ driveId, driveKey, owner, latestRevisionsOnly: true })
		);
	}

	async getPublicChildrenFolderIds({
		folderId,
		owner,
		driveId
	}: getPublicChildrenFolderIdsParams): Promise<FolderID[]> {
		return this.getChildrenFolderIds(
			folderId,
			await this.getAllFoldersOfPublicDrive({ driveId, owner, latestRevisionsOnly: true })
		);
	}

	public async getOwnerAndAssertDrive(driveId: DriveID, driveKey?: DriveKey): Promise<ArweaveAddress> {
		const gqlQuery = buildQuery({
			tags: [
				{ name: 'Entity-Type', value: 'drive' },
				{ name: 'Drive-Id', value: `${driveId}` }
			],
			sort: ASCENDING_ORDER
		});
		const response = await this.arweave.api.post(graphQLURL, gqlQuery);
		const edges: GQLEdgeInterface[] = response.data.data.transactions.edges;

		if (!edges.length) {
			throw new Error(`Could not find a transaction with "Drive-Id": ${driveId}`);
		}

		const edgeOfFirstDrive = edges[0];

		const drivePrivacy: DrivePrivacy = driveKey ? 'private' : 'public';
		const drivePrivacyFromTag = edgeOfFirstDrive.node.tags.find((t) => t.name === 'Drive-Privacy');

		if (!drivePrivacyFromTag) {
			throw new Error('Target drive has no "Drive-Privacy" tag!');
		}

		if (drivePrivacyFromTag.value !== drivePrivacy) {
			throw new Error(`Target drive is not a ${drivePrivacy} drive!`);
		}

		if (driveKey) {
			const cipherIVFromTag = edgeOfFirstDrive.node.tags.find((t) => t.name === 'Cipher-IV');
			if (!cipherIVFromTag) {
				throw new Error('Target private drive has no "Cipher-IV" tag!');
			}

			const driveDataBuffer = Buffer.from(
				await this.arweave.transactions.getData(edgeOfFirstDrive.node.id, { decode: true })
			);

			try {
				// Attempt to decrypt drive to assert drive key is correct
				await driveDecrypt(cipherIVFromTag.value, driveKey, driveDataBuffer);
			} catch {
				throw new Error('Provided drive key or password could not decrypt target private drive!');
			}
		}

		const driveOwnerAddress = edgeOfFirstDrive.node.owner.address;

		return new ArweaveAddress(driveOwnerAddress);
	}

	/**
	 * Lists the children of certain private folder
	 * @param {FolderID} folderId the folder ID to list children of
	 * @param {DriveKey} driveKey the drive key used for drive and folder data decryption and file key derivation
	 * @param {number} maxDepth a non-negative integer value indicating the depth of the folder tree to list where 0 = this folder's contents only
	 * @param {boolean} includeRoot whether or not folderId's folder data should be included in the listing
	 * @returns {ArFSPrivateFileOrFolderWithPaths[]} an array representation of the children and parent folder
	 */
	async listPrivateFolder({
		folderId,
		driveKey,
		maxDepth,
		includeRoot,
		owner
	}: ArFSListPrivateFolderParams): Promise<ArFSPrivateFileOrFolderWithPaths[]> {
		if (!Number.isInteger(maxDepth) || maxDepth < 0) {
			throw new Error('maxDepth should be a non-negative integer!');
		}

		const folder = await this.getPrivateFolder(folderId, driveKey, owner);

		// Fetch all of the folder entities within the drive
		const driveIdOfFolder = folder.driveId;
		const allFolderEntitiesOfDrive = await this.getAllFoldersOfPrivateDrive({
			driveId: driveIdOfFolder,
			driveKey,
			owner,
			latestRevisionsOnly: true
		});

		const hierarchy = FolderHierarchy.newFromEntities(allFolderEntitiesOfDrive);
		const searchFolderIDs = hierarchy.folderIdSubtreeFromFolderId(folderId, maxDepth - 1);
		const [, ...subFolderIDs]: FolderID[] = hierarchy.folderIdSubtreeFromFolderId(folderId, maxDepth);

		const childrenFolderEntities = allFolderEntitiesOfDrive.filter((folder) =>
			subFolderIDs.includes(folder.entityId)
		);

		if (includeRoot) {
			childrenFolderEntities.unshift(folder);
		}

		// Fetch all file entities within all Folders of the drive
		const childrenFileEntities = await this.getPrivateFilesWithParentFolderIds(
			searchFolderIDs,
			driveKey,
			owner,
			true
		);

		const children = [...childrenFolderEntities, ...childrenFileEntities];

		const entitiesWithPath = children.map((entity) => new ArFSPrivateFileOrFolderWithPaths(entity, hierarchy));
		return entitiesWithPath;
	}

	async assertValidPassword(password: string): Promise<void> {
		const wallet = this.wallet;
		const walletAddress = await wallet.getAddress();
		const query = buildQuery({
			tags: [
				{ name: 'Entity-Type', value: 'drive' },
				{ name: 'Drive-Privacy', value: 'private' }
			],
			owner: walletAddress,
			sort: ASCENDING_ORDER
		});
		const response = await this.arweave.api.post(graphQLURL, query);
		const { data } = response.data;
		const { transactions } = data;
		const { edges } = transactions;
		if (!edges.length) {
			// No drive has been created for this wallet
			return;
		}
		const { node }: { node: GQLNodeInterface } = edges[0];
		const safeDriveBuilder = SafeArFSDriveBuilder.fromArweaveNode(
			node,
			this.arweave,
			new PrivateKeyData({ password, wallet: this.wallet as JWKWallet })
		);
		const safelyBuiltDrive = await safeDriveBuilder.build();
		if (
			safelyBuiltDrive.name === ENCRYPTED_DATA_PLACEHOLDER ||
			`${safelyBuiltDrive.rootFolderId}` === ENCRYPTED_DATA_PLACEHOLDER
		) {
			throw new Error(`Invalid password! Please type the same as your other private drives!`);
		}
	}
}
