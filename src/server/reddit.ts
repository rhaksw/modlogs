import { inspect } from 'util';
import { ConstructorOptions, ModAction, PrivateMessage, RedditUser, Comment, Submission } from 'snoowrap';
import * as yaml from 'js-yaml';
import Snoowrap from './snoowrap';
import getLogger from './logger';
import { ISubreddit, ISubredditModlogConfig } from './models/subreddit/type';

const appId = process.env.APP_ID;
const appSecret = process.env.APP_SECRET;
const redditUsername = process.env.REDDIT_USER;
const redditPassword = process.env.REDDIT_PASSWORD;
const userAgent = process.env.USER_AGENT;

const defaultSnooOpts: ConstructorOptions = {
  userAgent,
  username: redditUsername,
  password: redditPassword,
  clientId: appId,
  clientSecret: appSecret,
};

const modLogWikiPageName = 'modlog_config';

// used for getting the submission and comment ids out of a permalink
const thingIdRegExp = /\/r\/\w+\/comments\/(\w+)\/?\w+\/?(\w+)?/;

export const isComment = (fullname: string) => fullname && fullname.startsWith('t1_');
export const isSubmission = (fullname: string) => fullname && fullname.startsWith('t3_');

export class Reddit {
  private r: Snoowrap;
  private logger = getLogger('reddit');

  // tslint:disable-next-line:member-ordering
  constructor(opts?: ConstructorOptions) {
    const options: ConstructorOptions = Object.assign({}, defaultSnooOpts, opts);
    this.r = new Snoowrap(options);
    this.logger.info('running as reddit user', options.username);
    this.logger.info('running under app id', options.clientId);
  }

  public async getModdedSubreddits(): Promise<ISubreddit[]> {
    const subs = await this.r.getModeratedSubreddits().fetchAll();
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

  public getThingIdsFromLink(link: string): { submissionId?: string; commentId?: string; } {
    if (typeof link !== 'string') return {};
    const match = link.match(thingIdRegExp);
    if (!match || !match.length) return {};
    return {
      submissionId: match[1],
      commentId: match[2],
    };
  }

  public async getInboxMessages(): Promise<PrivateMessage[]> {
    try {
      return await this.r.getUnreadMessages().fetchAll();
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
      return await this.r.getSubreddit(name).getModerationLog(opts).fetchAll();
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
      return await this.r.getUser(username).getComments().fetchAll();
    } catch (err) {
      this.logger.error(inspect(err));
      return [];
    }
  }

  public async getUserSubmissions(username: string): Promise<Submission[]> {
    try {
      return await this.r.getUser(username).getSubmissions().fetchAll();
    } catch (err) {
      this.logger.error(inspect(err));
      return [];
    }
  }
}

export default new Reddit();
