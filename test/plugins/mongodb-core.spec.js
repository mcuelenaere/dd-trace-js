'use strict'

const agent = require('./agent')

describe('Plugin', () => {
  let plugin
  let mongo
  let server
  let platform
  let collection

  function setupMongo () {
    return new Promise((resolve, reject) => {
      server = new mongo.Server({
        host: 'localhost',
        port: 27017,
        reconnect: false
      })

      server.on('connect', server => {
        server.command('test', {
          create: collection
        }, {}, (err, result) => {
          server.destroy()
          server = null

          if (err) {
            reject(err)
          } else {
            resolve()
          }
        })
      })

      server.on('error', reject)

      server.connect()
    })
  }

  describe('mongodb-core', () => {
    beforeEach(() => {
      mongo = require('mongodb-core')
      plugin = require('../../src/plugins/mongodb-core')
      platform = require('../../src/platform')

      collection = platform.id().toString()

      return setupMongo()
    })

    afterEach(() => {
      agent.close()
      server.destroy()
    })

    describe('without configuration', () => {
      beforeEach(done => {
        agent.load(plugin, 'mongodb-core')
          .then(() => {
            server = new mongo.Server({
              host: 'localhost',
              port: 27017,
              reconnect: false
            })

            server.on('connect', () => done())
            server.on('error', done)

            server.connect()
          })
          .catch(done)
      })

      describe('server', () => {
        it('should do automatic instrumentation', done => {
          agent
            .use(traces => {
              const span = traces[0][0]
              const resource = `insert test.${collection}`

              expect(span).to.have.property('name', 'mongodb.query')
              expect(span).to.have.property('service', 'mongodb')
              expect(span).to.have.property('resource', resource)
              expect(span).to.have.property('type', 'db')
              expect(span.meta).to.have.property('db.name', `test.${collection}`)
              expect(span.meta).to.have.property('out.host', 'localhost')
              expect(span.meta).to.have.property('out.port', '27017')
            })
            .then(done)
            .catch(done)

          server.insert(`test.${collection}`, [{ a: 1 }], {}, () => {})
        })

        it('should sanitize the query as the resource', done => {
          agent
            .use(traces => {
              const span = traces[0][0]
              const resource = `command test.${collection} {"foo":"?","bar":{"baz":"?"}}`

              expect(span).to.have.property('resource', resource)
            })
            .then(done)
            .catch(done)

          server.command(`test.${collection}`, {
            find: `test.${collection}`,
            query: {
              foo: 1,
              bar: {
                baz: [1, 2, 3]
              }
            }
          }, () => {})
        })

        it('should handle errors', done => {
          let error

          agent
            .use(traces => {
              expect(traces[0][0].meta).to.have.property('error.type', error.name)
              expect(traces[0][0].meta).to.have.property('error.msg', error.message)
              expect(traces[0][0].meta).to.have.property('error.stack', error.stack)
            })
            .then(done)
            .catch(done)

          server.insert('', [{ a: 1 }], (err) => {
            error = err
            server.destroy()
          })
        })
      })

      describe('cursor', () => {
        it('should do automatic instrumentation', done => {
          agent
            .use(traces => {
              const span = traces[0][0]

              expect(span).to.have.property('name', 'mongodb.query')
              expect(span).to.have.property('service', 'mongodb')
              expect(span).to.have.property('type', 'db')
              expect(span.meta).to.have.property('db.name', `test.${collection}`)
              expect(span.meta).to.have.property('out.host', 'localhost')
              expect(span.meta).to.have.property('out.port', '27017')
            })
            .then(done)
            .catch(done)

          const cursor = server.cursor(`test.${collection}`, {
            find: `test.${collection}`,
            query: { a: 1 }
          })

          cursor.next()
        })

        it('should sanitize the query as the resource', done => {
          agent
            .use(traces => {
              const span = traces[0][0]
              const resource = `cursor test.${collection} {"foo":"?","bar":{"baz":"?"}}`

              expect(span).to.have.property('resource', resource)
            })
            .then(done)
            .catch(done)

          const cursor = server.cursor(`test.${collection}`, {
            find: `test.${collection}`,
            query: {
              foo: 1,
              bar: {
                baz: [1, 2, 3]
              }
            }
          })

          cursor.next()
        })
      })
    })

    describe('with configuration', () => {
      let config

      beforeEach(done => {
        config = {
          service: 'custom'
        }

        agent.load(plugin, 'mongodb-core', config)
          .then(() => {
            server = new mongo.Server({
              host: 'localhost',
              port: 27017,
              reconnect: false
            })

            server.on('connect', () => done())
            server.on('error', done)

            server.connect()
          })
          .catch(done)
      })

      it('should be configured with the correct values', done => {
        agent
          .use(traces => {
            expect(traces[0][0]).to.have.property('service', 'custom')
          })
          .then(done)
          .catch(done)

        server.insert(`test.${collection}`, [{ a: 1 }], () => {})
      })
    })
  })
})
