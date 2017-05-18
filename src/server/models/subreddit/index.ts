import { Collection } from 'mongodb';
import { getDb } from '../../db';
import { ISubreddit, ISubredditModlogConfig } from './type';

interface ISubredditWithConfig extends ISubreddit {
  modlogConfig: ISubredditModlogConfig;
}

const mySubredditsCollectionName = 'subreddits';
const isDevelopment = process.env.NODE_ENV === 'development';

// config items that are expected to be arrays of lowercase strings, which get normalized in getSubredditConfig
const configArrayItems: Array<keyof ISubredditModlogConfig> = [
  'include_moderators', 'exclude_moderators', 'include_actions', 'exclude_actions',
];

// everything is enabled by default in dev, disabled by default in prod
const defaultSubredditModlogConfig: ISubredditModlogConfig = {
  show_comment_links: isDevelopment,
  show_submission_links: isDevelopment,
  show_comment_contents: isDevelopment,
  show_submission_contents: isDevelopment,
  show_comment_author: isDevelopment,
  show_submission_author: isDevelopment,
  show_submission_title: isDevelopment,
  show_moderator_name: isDevelopment,
  include_actions: null,
  exclude_actions: null,
  include_moderators: null,
  exclude_moderators: null,
};

export async function getMySubredditsCollection(): Promise<Collection> {
  const db = await getDb();
  return db.collection(mySubredditsCollectionName);
}

export async function getMySubreddits(): Promise<ISubreddit[]> {
  const collection = await getMySubredditsCollection();
  return collection.find<ISubreddit>().toArray();
}

export async function getSubredditConfig(subredditName: string): Promise<ISubredditModlogConfig> {
  const collection = await getMySubredditsCollection();
  const subreddit = await collection.findOne({ name: new RegExp(subredditName, 'i') }) as ISubredditWithConfig;

  if (!subreddit) return defaultSubredditModlogConfig;

  const config = subreddit.modlogConfig;
  configArrayItems.map(thing => {
    if (config[thing]) {
      if (!Array.isArray(config[thing])) {
        config[thing] = [];
      }

      config[thing] = (config[thing] as string[]).map(item => {
        return typeof item === 'string' ? item.toLowerCase() : '';
      });
    }
  });

  return Object.assign({}, defaultSubredditModlogConfig, config);
}

export { ISubreddit, ISubredditModlogConfig };
