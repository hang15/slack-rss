const RSSParser = require('rss-parser')
const { Pool } = require('pg')

const client = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: true,
  connectionTimeoutMillis: 3000,
  max : 5
})

module.exports = {
  getRssFeed(feedUrl) {
    let parser = new RSSParser()
    return new Promise((resolve, reject) => {
      parser.parseURL(feedUrl, function (err, feed) {
        if (err) reject(err)
        resolve(feed)
      })
    })
  },
  async init() {
    await client.query(
      `CREATE TABLE IF NOT EXISTS rss_subscriptions (
            user_id varchar,
            alias varchar,
            rss_url varchar,
            PRIMARY KEY(user_id, alias)
        )`
    )
  },
  async subscribe(user_id, alias, feedUrl) {
    let res = await client.query(
      `INSERT INTO rss_subscriptions(user_id, alias, rss_url) VALUES ($1, $2, $3)
      ON CONFLICT (user_id, alias) DO UPDATE set rss_url = excluded.rss_url`,
      [user_id, alias, feedUrl]
    )
    return res
  },
  async unSubscribe(user_id, alias) {
    let res = await client.query(
      `DELETE FROM rss_subscriptions
      WHERE user_id=$1 and alias=$2`,
      [user_id, alias]
    )
    return res
  },
  async getRssUrl(user_id, alias) {
    let res = await client.query(
      `SELECT rss_url from rss_subscriptions
       WHERE user_id=$1 and alias=$2`,
      [user_id, alias]
    )
    if (res.rows.length === 0) {
      return null
    }
    return res.rows[0].rss_url
  },
  async listSubscriptions(user_id) {
    let res = await client.query(
      `SELECT alias, rss_url from rss_subscriptions
       WHERE user_id=$1`,
      [user_id]
    )
    return res.rows
  }
}
