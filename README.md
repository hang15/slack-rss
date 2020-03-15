### Slack RSS bot

Accompanying code for the post - [Build a Slack RSS bot using node.js](https://medium.com/@hang.c/build-a-slack-rss-bot-using-node-js-c0bbffa1e683)

### Usage

1. Subscribe to a new RSS feed, with alias name to fetch the subscription.

    - `/rss subscribe <alias> <url>`

2. Gets the latest RSS feeds from an existing subscription using alias name.

    - `/rss fetch <alias> [numFeeds]`
    
3. List all existing subscriptions
    
    - `/rss list`

4. Unsubscribe an existing subscription using alias name.
    - `/rss unsubscribe <alias>`