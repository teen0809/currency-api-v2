import { Injectable } from '@nestjs/common';
import { PaginatedResult } from '@src/common/pagination/pagination.types';
import { Between, DataSource, Repository } from 'typeorm';
import { buildPaginator } from 'typeorm-cursor-pagination';
import { TransactionFilterDto } from './dto/transaction.filter.dto';
import { Transaction } from './transaction.entity';

@Injectable()
export class TransactionRepository extends Repository<Transaction> {
  constructor(private readonly dataSource: DataSource) {
    super(Transaction, dataSource.manager);
  }

  async getPaginatedQueryBuilder(searchParams: TransactionFilterDto): Promise<PaginatedResult<Transaction>> {
    const queryBuilder = this.createQueryBuilder('transaction');

    if ('userId' in searchParams) {
      queryBuilder.andWhere({ userId: searchParams.userId });
    }

    if ('currencyId' in searchParams) {
      queryBuilder.andWhere({ currencyId: searchParams.currencyId });
    }

    if ('fromDate' in searchParams && 'toDate' in searchParams) {
      queryBuilder.andWhere({ createdAt: Between(searchParams.fromDate, searchParams.toDate) });
    }

    const paginator = buildPaginator({
      entity: Transaction,
      paginationKeys: ['id', searchParams.orderParam],
      query: {
        limit: searchParams.limit,
        order: searchParams.orderType,
        afterCursor: searchParams.afterCursor,
        beforeCursor: searchParams.beforeCursor,
      },
    });

    return paginator.paginate(queryBuilder);
  }

  async getBalanceAll(userId: number) {
    const res = await this.createQueryBuilder('balance')
      .where({ userId })
      .select(['id', 'currency_id', 'SUM(amount)'])
      // // .groupBy('balance.id')
      // .addGroupBy('balance.currency_id')
      .getQuery();
    // .getRawMany();

    return res;
  }

  async getBalanceByCurrency(userId: number, currencyId: number): Promise<number> {
    const { sum } = await this.createQueryBuilder('transaction')
      .select('SUM(amount)', 'sum')
      .where({ userId, currencyId })
      .getRawOne();

    return Number(sum);
  }

  async convertCurrency(
    fromCurrencyId: number,
    fromCurrencyAmount: number,
    toCurrencyId: number,
    toCurrencyAmount: number,
    userId: number,
  ): Promise<null> {
    const fromTransaction = await this.create({
      userId,
      currencyId: fromCurrencyId,
      amount: fromCurrencyAmount,
      description: `Convert`,
    });
    const toTransaction = await this.create({
      userId,
      currencyId: toCurrencyId,
      amount: toCurrencyAmount,
      description: `Convert`,
    });

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.manager.save(fromTransaction);
      await queryRunner.manager.save(toTransaction);

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
    } finally {
      await queryRunner.release();
    }

    return null;
  }
}