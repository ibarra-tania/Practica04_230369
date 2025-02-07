import express from 'express';
import session from 'express-session';
import bodyParser from 'body-parser';
import moment from 'moment-timezone';
import {v4 as uuidv4} from 'uuid';
import macaddress from 'macaddress';
import os from 'os';
import mongoose from 'mongoose';
import {model, Schema} from 'mongoose';

const app= express();
const PORT = 3500;

app.listen(PORT, ()=> {
    console.log(`Servidor iniciado en http://localhost ${PORT}`);
});

app.use(express.json()); //Habilita la comunicación ´por medio del body y entienda el estandar
app.use(express.urlencoded({extended: true}));

mongoose.connect('mongodb+srv://tass:TantanC14AI@clustertania.6aqxg.mongodb.net/sessions_control_db?retryWrites=true&w=majority&appName=ClusterTania')
.then((db)=> console.log("Mongo connect"))
.catch((error)=> console.log(error))

//Sesones almacenadas en Memoria RAM

app.use(
    session({
        secret: "P4-TIS#cabre-SesionesHTTP-VariableDeSesion",
        resave: false,
        saveUninitialized: true,
        cookie: {maxAge: 5*60*1000}
    })
)

const filterSession = (session) => {
    const { cookie, ...filteredSession } = session;
    return filteredSession;
};

//Bienvenida al entrar al servidor
app.get('/', (req, res) =>{
    return res.status(200).json({message: "Bienvenida al API de Control de Sesiones",
                                                author: "Tania Ibarra Salgado"})
});

//Función de utilidad que nos permitiera acceder a la info de la interfaz de red
const getLocal = () =>{
    const networkInterfaces = os.networkInterfaces();
    for(const interfaceName in networkInterfaces){
        const interfaces = networkInterfaces[interfaceName];
        for(const iface of interfaces){
            // IPv4 y no interna (no localhost)
            if(iface.family === "IPv4" && !iface.internal){
                return iface.address;
            }
        }
    }
    return null; //Retorna null si no encuentra una IP válida
}

const getMac= () =>{
    return new Promise((resolve, reject) => {
        macaddress.one((err, mac)=>{
            if(err){
                reject(err);
            }
            resolve(mac)
        })
    })
}

const sessionSchema = new Schema({
    sessionId: { type: String, required: true, unique: true },
    email: { type: String, required: true },
    nickname: { type: String, required: true },
    macAddress: { type: String, required: true },
    createdAt: { type: String, required: true },
    lastAccesed: { type: String, required: true },
    serverIp: { type: String, required: true },
    serverMac: { type: String, required: true }
});

const SessionModel = model('Session', sessionSchema);

sessionSchema.index({ lastAccesed: 1 }, { expireAfterSeconds: 120 });

//Endpoint de logueo
app.post('/login', async(req, res) =>{
    const {email, nickname, macAddress} = req.body;

    if(!email || !nickname || !macAddress){
        return res.status(400).json({message: "Se esperan campos requeridos"})
    }

    const sessionId = uuidv4();
    const createdAt_CDMX = moment().tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss')

    const sessionData = {
        sessionId,
        email,
        nickname,
        macAddress,
        createdAt: createdAt_CDMX,
        lastAccesed: createdAt_CDMX,
        serverIp: getLocal(),
        serverMac: await getMac()
    }

    try{
        const newSession = new SessionModel(sessionData);
        await newSession.save();
        res.status(200).json({
            message: "Se ha ingresado exitosamente",
            sessionId
        })
    } catch(error){
        res.status(500).json({
            message: "Error al guardar sesión", error
        })
    }

})

app.post('/update', async(req, res)=>{
    const {email, nickname} = req.body;

    if(!req.session.sessionId){
        return res.status(400).json({message: "No existe una sesión activa"})
    }

    try{
        const session = await  SessionModel.findOne({sessionId: req.session.sessionId});

        if(!session){
            return res.status(404).json({message: "Sesión no encontrada"})
        }

        if(email) session.email= email;
        if(nickname) session.nickname = nickname;
        session.lastAccesed= moment().tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss')

        await session.save();
        res.status(200).json({
            message: 'Datos actualizados', session: filterSession(session)
        })
    } catch(error){
        res.status(500).json({message: "Error al actualizar la sesión", error})
    }
})

app.post("/status", async(req,res)=>{
    if(!req.session.sessionId){
        return res.status(404).json({
            message:"No existe una sesion activa"
        });
    }
    
    try{
        const session= await SessionModel.findOne({sessionId: req.session.sessionId})
        if(!session){
            return res.status(404).json({message: "Sesión no encontrada"})
        }

        const now= moment();
        const time = now.diff(moment(session.lastAccesed, 'YYYY/MM/DD HH:mm:ss'), 'seconds');
        const duration= now.diff(moment(session.createdAt, 'YYYY/MM/DD HH:mm:ss'), 'seconds');

        res.status(200).json({
            message: "Sesión Activa",
            session: {
                ...filterSession(session),
                clientIp: req.ip
            },
            time: `${time} segundos`,
            duration: `${duration} segundos`
        })
    }catch(error){
        res.status(500).json({message: "Error al obtener el estado de la sesión", error})
    }
});

app.get('/sessionAll', async(req, res) => {
    try {
        // Consultar todas las sesiones en la base de datos
        const sessions = await SessionModel.find({});

        if (sessions.length === 0) {
            return res.status(404).json({
                message: 'No hay sesiones activas'
            });
        }

        // Formatear las sesiones para la respuesta
        const formattedSessions = sessions.map(session => ({
            ...filterSession(session.toObject()),
            clientIp: req.ip,
            createdAt: moment(session.createdAt).tz('America/Mexico_City').format('YYYY/MM/DD HH:mm:ss'),
            lastAccesed: moment(session.lastAccesed).tz('America/Mexico_City').format('YYYY/MM/DD HH:mm:ss')
        }));

        res.status(200).json({
            message: 'Sesiones activas',
            sessions: formattedSessions
        });
    } catch (error) {
        res.status(500).json({
            message: 'Error al obtener las sesiones activas',
            error: error.message
        });
    }
});


app.post('/logout', async(req, res)=>{

    if(!req.session.sessionId){
        return res.status(404).json({message: "No se ha encontrado una sesión activa"});
    }

    try {
        await SessionModel.deleteOne({ sessionId: req.session.sessionId });
        req.session.destroy((err) => {
            if (err) {
                return res.status(500).send('Error al cerrar sesión');
            }
        });
        res.status(200).json({ message: "Logout successful" });
    } catch (error) {
        res.status(500).json({ message: "Error al cerrar la sesión", error });
    }
});

