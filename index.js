const express = require('express')
require('dotenv').config()
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express()
const jwt = require('jsonwebtoken');

app.use(express.static("public"));
const port = process.env.PORT || 5000
// const mongoose = require('mongoose');
// const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
// app.use(express.static("public"));
app.use(cors())
app.use(express.json())

const uri = `mongodb+srv://${process.env.BD_USER}:${process.env.BD_PASS}@cluster0.ktupw59.mongodb.net/?retryWrites=true&w=majority`;
console.log(uri)

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {

        const surveyCollection = client.db("surveyDB").collection("create-survey");
        const usersCollection = client.db("surveyDB").collection("users");
        const votesCollection = client.db("surveyDB").collection("votes");
        const commentsCollection = client.db("surveyDB").collection("comments");
        

        // jwt related api
        app.post('/api/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            console.log(' token token tik::', token)
            res.send({ token });
        })

        // middlewares 
        const verifyToken = (req, res, next) => {
            // console.log('inside verify token', req.headers.authorization);
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'unauthorized access' });
            }
            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'unauthorized access' })
                }
                req.decoded = decoded;
                next();
            })
        }
        // use verify admin after verifyToken
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next();
        }
        app.post('/api/votes', async (req, res) => {
            const vote = req.body;
            const result = await votesCollection.insertOne(vote)
            res.send(result)
        })
        app.post('/api/users', async (req, res) => {
            const user = req.body
            const query = { email: user.email }
            const existingUser = await usersCollection.findOne(query)
            if (existingUser) {
                return res.send({ message: 'user already login', insertedId: null })
            }
            const result = await usersCollection.insertOne(user)
            res.send(result)
        })
        app.get('/api/users', async (req, res) => {
            // console.log(req.headers)
            const result = await usersCollection.find().toArray()
            res.send(result)
        })

        app.get('/api/users/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email;

            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' })
            }
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            let admin = false;
            if (user) {
                admin = user?.role === 'admin';
            }
            res.send({ admin });
        })
        app.get('/api/create-survey', async (req, res) => {
            const result = await surveyCollection.find().sort({vote:-1}).limit(6).toArray()
            res.send(result)
        })
        app.get('/api/create-survey/date', async (req, res) => {
            const result = await surveyCollection.find().sort({timestamp: -1}).limit(6).toArray()
            res.send(result)
        })
        app.get('/api/create-survey/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const data = await surveyCollection.findOne(query);
            res.send(data)
        })
        // creat a survey post
        app.post('/api/create-survey',verifyToken,verifyAdmin, async (req, res) => {
            const survey = req.body
            survey.timestamp =new Date(Date.now())
            console.log(survey)
            const result = await surveyCollection.insertOne(survey)
            res.send(result)

        })
        // comments
        app.post('/api/comments', async (req, res) => {
            const comment = req.body;
            const result = await commentsCollection.insertOne(comment)
            res.send(result)
        })
        // comments
        app.get('/api/comments/', async (req, res) => {
            const result = await commentsCollection.find().toArray()
            res.send(result)
        })
        app.delete('/api/users/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await usersCollection.deleteOne(query);
            res.send(result);
        })
        // update
        app.patch('/api/create-survey/:id', async (req, res) => {
            const id = req.params.id
            console.log(id)
            const filter = { _id: new ObjectId(id) };
            // const option={upsert:true}
            const updatedDoc = { $inc: {vote: 1} }
            const result = await surveyCollection.updateOne(filter, updatedDoc);
            res.send(result);
        })
        app.patch('/api/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            console.log(id)
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await usersCollection.updateOne(filter, updatedDoc);
            res.send(result);
        })
        app.post("/create-payment-intent", async (req, res) => {
            // const { price } = req.body;
            const token = req.body.token;
            // const amount = parseInt(price * 100)
            const paymentIntent = await stripe.paymentIntents.create({
                amount: 999,
                currency: "usd",
                payment_methods_type:
                    ['cart']
            });
            const userId = req.user.id;
            const user = await User.findById(userId);

            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            // Update the user's role to 'pro-user'
            user.role = 'pro-user';
            await user.save();
            // 
            const userSchema = new mongoose.Schema({
                username: { type: String, required: true, unique: true },
                password: { type: String, required: true },
                role: { type: String, enum: ['user', 'surveyor', 'admin', 'pro-user'], default: 'user' },
            });

            const User = mongoose.model('User', userSchema);

            module.exports = User;
            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        })
       


        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Hello World therer!')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})
