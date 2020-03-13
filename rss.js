const RSSParser = require('rss-parser')

module.exports = {
    getRssFeed(feedUrl) {
        let parser = new RSSParser()
        return new Promise((resolve, reject) => {
            parser.parseURL(feedUrl, function(err, feed) {
                if (err) reject(err)
                resolve(feed)
        })})
    }
}
