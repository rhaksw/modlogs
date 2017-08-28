import { inspect } from 'util';
import * as Snoowrap from 'snoowrap';
import { SnoowrapOptions, ModAction, PrivateMessage, RedditUser, Comment, Submission } from 'snoowrap';
import * as yaml from 'js-yaml';
import getLogger from './logger';
import { ISubreddit, ISubredditModlogConfig } from './models/subreddit/type';
import { Metric, MetricType } from './models/metric';

const appId = process.env.APP_ID;
const appSecret = process.env.APP_SECRET;
const redditUsername = process.env.REDDIT_USER;
const redditPassword = process.env.REDDIT_PASSWORD;
const userAgent = process.env.USER_AGENT;

const defaultSnooOpts: SnoowrapOptions = {
  userAgent,
  username: redditUsername,
  password: redditPassword,
  clientId: appId,
  clientSecret: appSecret,
};

const modLogWikiPageName = 'modlog_config';

export const isComment = (fullname: string) => fullname && fullname.startsWith('t1_');
export const isSubmission = (fullname: string) => fullname && fullname.startsWith('t3_');

interface ThingIds {
  submissionId: string | null;
  commentId: string | null;
  subreddit: string | null;
}

const thingIdRegExp = /\/r\/(\w+)\/?(?:comments)?\/?(\w+)?\/?(?:\w+)?\/?(\w+)?/;
export function getThingIdsFromLink(link: string): ThingIds {
  const noResults: ThingIds = { submissionId: null, commentId: null, subreddit: null };
  if (typeof link !== 'string') return noResults;
  const match = link.match(thingIdRegExp);
  if (!match || !match.length) return noResults;

  return {
    subreddit: match[1],
    submissionId: match[2] || null,
    commentId: match[3] || null,
  };
}

// extract a username from /u/username or u/username
export const parseUsername = (username: string): string => {
  const match: string[] = /(?:u\/)?(\w+)/.exec(username) || [];
  return match[1] || username;
};

// override snoowrap's rawRequest so we can record the reddit api requests
class SnoowrapWithMetrics extends Snoowrap {
  public rawRequest(options: any): Promise<any> {
    let metric: Metric;
    if (options && options.uri !== 'api/v1/access_token') {
      metric = new Metric(MetricType.redditApi, {
        baseUrl: options.baseUrl,
        uri: options.uri,
        method: options.method,
        qs: options.qs,
        body: options.form,
      });
    }

    return super.rawRequest(options).then((...res: any[]) => {
      if (metric) {
        metric.report(null, {
          rateLimitRemaining: this.ratelimitRemaining,
        });
      }
      return Promise.resolve(...res);
    }).catch((err: any) => {
      if (metric) metric.report({
        status: err.statusCode,
        message: err.message,
      }, {
        rateLimitRemaining: this.ratelimitRemaining,
      });
      return Promise.reject(err);
    });
  }
}

export class Reddit {
  constructor(opts?: SnoowrapOptions) {
    const options: SnoowrapOptions = Object.assign({}, defaultSnooOpts, opts);
    this.r = new SnoowrapWithMetrics(options);
    this.logger.info('running as reddit user', options.username);
    this.logger.info('running under app id', options.clientId);
    this.r.config({
      proxies: false,
    });
  }

  private r: Snoowrap;
  private logger = getLogger('reddit');

  public async getModdedSubreddits(): Promise<ISubreddit[]> {
    const subs = await (await this.r.getModeratedSubreddits()).fetchAll();
    const formattedSubs: ISubreddit[] = subs.map(sub => ({
      id: sub.id,
      name: sub.display_name,
      nameLowercase: sub.display_name.toLowerCase(),
      description: sub.description,
      shortDescription: sub.public_description,
      title: sub.title,
      created: sub.created_utc * 1000,
      subscribers: sub.subscribers,
    }));
    return formattedSubs;
  }

  public async getSubredditConfig(subreddit: string): Promise<ISubredditModlogConfig | null> {
    try {
      const wikipage = await this.r.getSubreddit(subreddit).getWikiPage(modLogWikiPageName).fetch();
      const config: ISubredditModlogConfig = yaml.safeLoad(wikipage.content_md);
      return config;
    } catch (err) {
      return null;
    }
  }

  public getThingIdsFromLink(link: string) {
    return getThingIdsFromLink(link);
  }

  public async getInboxMessages(): Promise<PrivateMessage[]> {
    try {
      return (await this.r.getUnreadMessages()).fetchAll();
    } catch (err) {
      this.logger.error(inspect(err));
      return [];
    }
  }

  public async sendMessage({ to, subject, content }: { to: string; subject: string; content: string; }) {
    try {
      await this.r.composeMessage({
        to,
        subject,
        text: content,
      });
    } catch (err) {
      this.logger.error(inspect(err));
    }
  }

  public async markMessagesRead(messageFullNames: PrivateMessage[] | string[]): Promise<void> {
    try {
      await this.r.markMessagesAsRead(messageFullNames);
    } catch (err) {
      this.logger.error(inspect(err));
    }
  }

  public async getSubredditModLogs(subredditName: string, opts: { after?: string; before?: string; }): Promise<ModAction[]> {
    try {
      return (await this.r.getSubreddit(subredditName).getModerationLog(opts)).fetchAll();
    } catch (err) {
      this.logger.error(inspect(err));
      return [];
    }
  }

  public async getSubredditModerators(subredditName: string): Promise<RedditUser[]> {
    try {
      return await this.r.getSubreddit(subredditName).getModerators();
    } catch (err) {
      this.logger.error(err);
      return [];
    }
  }

  public async getUserComments(username: string): Promise<Comment[]> {
    try {
      return (await this.r.getUser(username).getComments()).fetchAll();
    } catch (err) {
      this.logger.error(inspect(err));
      return [];
    }
  }

  public async getUserSubmissions(username: string): Promise<Submission[]> {
    try {
      return (await this.r.getUser(username).getSubmissions()).fetchAll();
    } catch (err) {
      this.logger.error(inspect(err));
      return [];
    }
  }

  public acceptModeratorInvite(subreddit: string) {
    return this.r.getSubreddit(subreddit).acceptModeratorInvite();
  }
}

export default new Reddit();
