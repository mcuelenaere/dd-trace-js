'use strict'

const axios = require('axios')
const getPort = require('get-port')
const agent = require('./agent')

describe('Plugin', () => {
  let plugin
  let context
  let express
  let appListener

  describe('express', () => {
    beforeEach(() => {
      plugin = require('../../src/plugins/express')
      express = require('express')
      context = require('../../src/platform').context({ experimental: { asyncHooks: false } })
    })

    afterEach(() => {
      agent.close()
      appListener.close()
    })

    describe('without configuration', () => {
      beforeEach(() => {
        return agent.load(plugin, 'express')
      })

      it('should do automatic instrumentation on app routes', done => {
        const app = express()

        app.get('/user', (req, res) => {
          res.status(200).send()
        })

        getPort().then(port => {
          agent.use(traces => {
            expect(traces[0][0]).to.have.property('service', 'test')
            expect(traces[0][0]).to.have.property('type', 'web')
            expect(traces[0][0]).to.have.property('resource', '/user')
            expect(traces[0][0].meta).to.have.property('span.kind', 'server')
            expect(traces[0][0].meta).to.have.property('http.url', `http://localhost:${port}/user`)
            expect(traces[0][0].meta).to.have.property('http.method', 'GET')
            expect(traces[0][0].meta).to.have.property('http.status_code', '200')

            done()
          })

          appListener = app.listen(port, 'localhost', () => {
            axios
              .get(`http://localhost:${port}/user`)
              .catch(done)
          })
        })
      })

      it('should do automatic instrumentation on routers', done => {
        const app = express()
        const router = express.Router()

        router.get('/user/:id', (req, res) => {
          res.status(200).send()
        })

        app.use('/app', router)

        getPort().then(port => {
          agent.use(traces => {
            expect(traces[0][0]).to.have.property('service', 'test')
            expect(traces[0][0]).to.have.property('type', 'web')
            expect(traces[0][0]).to.have.property('resource', '/app/user/:id')
            expect(traces[0][0].meta).to.have.property('span.kind', 'server')
            expect(traces[0][0].meta).to.have.property('http.url', `http://localhost:${port}/app/user/1`)
            expect(traces[0][0].meta).to.have.property('http.method', 'GET')
            expect(traces[0][0].meta).to.have.property('http.status_code', '200')

            done()
          })

          appListener = app.listen(port, 'localhost', () => {
            axios
              .get(`http://localhost:${port}/app/user/1`)
              .catch(done)
          })
        })
      })

      it('should surround matchers based on regular expressions', done => {
        const app = express()
        const router = express.Router()

        router.get(/^\/user\/(\d)$/, (req, res) => {
          res.status(200).send()
        })

        app.use('/app', router)

        getPort().then(port => {
          agent.use(traces => {
            expect(traces[0][0]).to.have.property('resource', '/app(/^\\/user\\/(\\d)$/)')

            done()
          })

          appListener = app.listen(port, 'localhost', () => {
            axios
              .get(`http://localhost:${port}/app/user/1`)
              .catch(done)
          })
        })
      })

      it('should support a nested array of paths on the router', done => {
        const app = express()
        const router = express.Router()

        router.get([['/user/:id'], '/users/:id'], (req, res) => {
          res.status(200).send()
        })

        app.use('/app', router)

        getPort().then(port => {
          agent.use(traces => {
            expect(traces[0][0]).to.have.property('resource', '/app/user/:id')

            done()
          })

          appListener = app.listen(port, 'localhost', () => {
            axios
              .get(`http://localhost:${port}/app/user/1`)
              .catch(done)
          })
        })
      })

      it('should fallback to the default resource name if a path pattern could not be found', done => {
        const app = express()

        app.use((req, res, next) => res.status(200).send())

        getPort().then(port => {
          agent.use(traces => {
            expect(traces[0][0]).to.have.property('resource', 'express.request')

            done()
          })

          appListener = app.listen(port, 'localhost', () => {
            axios
              .get(`http://localhost:${port}/app`)
              .catch(done)
          })
        })
      })

      it('should support context propagation', done => {
        const app = express()

        app.use((req, res, next) => {
          context.set('foo', 'bar')
          next()
        })

        app.get('/user', (req, res) => {
          res.status(200).send(context.get('foo'))
        })

        getPort().then(port => {
          appListener = app.listen(port, 'localhost', () => {
            axios.get(`http://localhost:${port}/user`)
              .then(res => {
                expect(res.status).to.equal(200)
                expect(res.data).to.equal('bar')
                done()
              })
              .catch(done)
          })
        })
      })

      it('should extract its parent span from the headers', done => {
        const app = express()

        app.get('/user', (req, res) => {
          expect(agent.currentSpan().context().baggageItems).to.have.property('foo', 'bar')
          res.status(200).send()
        })

        getPort().then(port => {
          agent.use(traces => {
            expect(traces[0][0].trace_id.toString()).to.equal('1234')
            expect(traces[0][0].parent_id.toString()).to.equal('5678')

            done()
          })

          appListener = app.listen(port, 'localhost', () => {
            axios
              .get(`http://localhost:${port}/user`, {
                headers: {
                  'x-datadog-trace-id': '1234',
                  'x-datadog-parent-id': '5678',
                  'ot-baggage-foo': 'bar'
                }
              })
              .catch(done)
          })
        })
      })
    })

    describe('with configuration', () => {
      let config

      beforeEach(() => {
        config = {
          service: 'custom'
        }

        return agent.load(plugin, 'express', config)
      })

      it('should be configured with the correct values', done => {
        const app = express()

        app.get('/user', (req, res) => {
          res.status(200).send()
        })

        getPort().then(port => {
          agent.use(traces => {
            expect(traces[0][0]).to.have.property('service', 'custom')

            done()
          })

          appListener = app.listen(port, 'localhost', () => {
            axios
              .get(`http://localhost:${port}/user`)
              .catch(done)
          })
        })
      })
    })
  })
})
