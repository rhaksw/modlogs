import * as moment from 'moment';
import userReport, { parseUsername } from '../user';
import { getSubredditLogsCollection } from '../../models/log';
import { createMockLogs } from './mockLogs';

jest.mock('snoowrap');

describe('User Report Generator', () => {
  const subName = 'userreport';

  beforeAll(async () => {
    const collection = await getSubredditLogsCollection(subName);
    await collection.insertMany(createMockLogs(subName));
  });

  afterAll(async () => {
    const collection = await getSubredditLogsCollection(subName);
    collection.remove({});
  });

  it('is a function', () => {
    expect(typeof userReport).toBe('function');
  });

  it('returns logs only for the specified subreddit', async () => {
    const report = await userReport({ username: 'homer', subreddit: subName, period: '3 months' });
    expect(report.removedComments.every(c => c.subreddit === subName )).toBe(true);
    expect(report.removedSubmissions.every(c => c.subreddit === subName)).toBe(true);
  });

  it('returns logs only for the specified user', async () => {
    const report = await userReport({ username: 'homer', subreddit: subName, period: '3 months' });
    expect(report.removedComments.every(c => c.author === 'homer')).toBe(true);
    expect(report.removedSubmissions.every(c => c.author === 'homer')).toBe(true);
  });

  it('returns logs from after the specified period', async () => {
    const today = moment().startOf('day');
    const maxTimestamp = today.unix() * 1000;
    const report = await userReport({ username: 'marge', subreddit: subName, period: '2 months' });
    expect(report.removedComments.every(c => c.timestamp >= maxTimestamp)).toBe(true);
    expect(report.removedSubmissions.every(c => c.timestamp >= maxTimestamp)).toBe(true);
  });

  it('returns the humanized period', async () => {
    const report = await userReport({ username: 'bart', subreddit: subName, period: '2 m' });
    expect(report.parsedPeriod).toEqual('2 months');
  });

  it('correctly parses the username', () => {
    expect(parseUsername('foo')).toEqual('foo');
    expect(parseUsername('/u/foo')).toEqual('foo');
    expect(parseUsername('u/foo')).toEqual('foo');
  });
});
