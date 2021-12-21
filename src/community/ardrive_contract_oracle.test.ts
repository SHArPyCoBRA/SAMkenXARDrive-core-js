import { expect } from 'chai';
import { spy } from 'sinon';
import { stubArweaveAddress, stubTxID } from '../../tests/stubs';
import { expectAsyncErrorThrow } from '../../tests/test_helpers';
import { ArDriveContractOracle } from './ardrive_contract_oracle';

describe('The ArDriveContractOracle', () => {
	const stubCommunityContract = {
		settings: [['fee', 15]],
		vault: { [`${stubArweaveAddress}`]: [{ balance: 500, start: 1, end: 2 }] },
		balances: { [`${stubArweaveAddress}`]: 200 }
	};
	const stubContractWithNoFee = {
		...stubCommunityContract,
		settings: [['not-a-fee', 'lol']]
	};
	const stubContractWithFeeAsString = {
		...stubCommunityContract,
		settings: [['fee', 'STUB_STRING']]
	};
	const stubContractWithNegativeFee = {
		...stubCommunityContract,
		settings: [['fee', -600]]
	};

	const stubContractReader = {
		async readContract() {
			return stubCommunityContract;
		}
	};
	const stubContractReaderWithNoFee = {
		async readContract() {
			return stubContractWithNoFee;
		}
	};
	const stubContractReaderWithFeeAsString = {
		async readContract() {
			return stubContractWithFeeAsString;
		}
	};
	const stubContractReaderWithNegativeFee = {
		async readContract() {
			return stubContractWithNegativeFee;
		}
	};

	const errorThrowingStubContractReader = {
		async readContract() {
			throw new Error('Big time fail!');
		}
	};
	const arDriveContractOracleWithError = new ArDriveContractOracle([errorThrowingStubContractReader]);
	const arDriveContractOracleWithFallback = new ArDriveContractOracle([
		errorThrowingStubContractReader,
		stubContractReader
	]);

	const arDriveContractOracle = new ArDriveContractOracle([stubContractReader]);
	const arDriveContractOracleWithNoFee = new ArDriveContractOracle([stubContractReaderWithNoFee]);
	const arDriveContractOracleWithFeeAsString = new ArDriveContractOracle([stubContractReaderWithFeeAsString]);
	const arDriveContractOracleWithNegativeFee = new ArDriveContractOracle([stubContractReaderWithNegativeFee]);

	describe('constructor', () => {
		it('does not read the community contract on construction by default', () => {
			const readContractSpy = spy(stubContractReader, 'readContract');
			new ArDriveContractOracle([stubContractReader]);
			expect(readContractSpy.callCount).to.equal(0);
		});

		it('reads the community contract once on construction when skipSetup is set to false', () => {
			const readContractSpy = spy(stubContractReader, 'readContract');
			new ArDriveContractOracle([stubContractReader], false);
			expect(readContractSpy.callCount).to.equal(1);
		});
	});

	describe('getPercentageFromContract method', () => {
		it('returns the expected fee result', async () => {
			expect(await arDriveContractOracle.getTipPercentageFromContract()).to.equal(0.15);
		});

		it('throws an error if fee does not exist', async () => {
			await expectAsyncErrorThrow({
				promiseToError: arDriveContractOracleWithNoFee.getTipPercentageFromContract(),
				errorMessage: 'Fee does not exist on smart contract settings'
			});
		});

		it('throws an error if fee is not a number', async () => {
			await expectAsyncErrorThrow({
				promiseToError: arDriveContractOracleWithFeeAsString.getTipPercentageFromContract(),
				errorMessage: 'Fee on smart contract settings is not a number'
			});
		});

		it('throws an error if fee is not a number', async () => {
			await expectAsyncErrorThrow({
				promiseToError: arDriveContractOracleWithNegativeFee.getTipPercentageFromContract(),
				errorMessage: 'Fee on smart contract community settings is set to a negative number'
			});
		});
	});

	describe('readContract method', () => {
		it('returns the expected stub community contract', async () => {
			expect(await arDriveContractOracle.readContract(stubTxID)).to.deep.equal(stubCommunityContract);
		});

		it('throws an error if contract cannot be resolved by any contract reader', async () => {
			await expectAsyncErrorThrow({
				promiseToError: arDriveContractOracleWithError.readContract(stubTxID),
				errorMessage: 'Max contract read attempts has been reached on the last fallback contract reader..'
			});
		});

		it('falls back to the next contract reader on error and returns the expected stub community contract', async () => {
			expect(await arDriveContractOracleWithFallback.readContract(stubTxID)).to.deep.equal(stubCommunityContract);
		});
	});

	describe('getCommunityContract method', () => {
		it('returns the cached contract if it exists rather than reading contract again', async () => {
			const readContractSpy = spy(stubContractReader, 'readContract');
			const contractOracle = new ArDriveContractOracle([stubContractReader]);
			expect(readContractSpy.callCount).to.equal(0);

			await contractOracle.getCommunityContract();
			expect(readContractSpy.callCount).to.equal(1);

			expect(await contractOracle.getCommunityContract()).to.deep.equal(stubCommunityContract);

			// No new calls on read contract
			expect(readContractSpy.callCount).to.equal(1);
		});

		it('returns the current promise to read the contract contract if it exists rather than reading contract again', async () => {
			const readContractSpy = spy(stubContractReader, 'readContract');
			const contractOracle = new ArDriveContractOracle([stubContractReader]);
			expect(readContractSpy.callCount).to.equal(0);

			// Do not await the result so that the next call will return the promise
			contractOracle.getCommunityContract();
			expect(readContractSpy.callCount).to.equal(1);

			expect(await contractOracle.getCommunityContract()).to.deep.equal(stubCommunityContract);

			// No duplicate calls to read contract during the promise
			expect(readContractSpy.callCount).to.equal(1);
		});
	});
});
