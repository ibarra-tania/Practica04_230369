import express, {request, response} from 'express';
import session from 'express-session';
import bodyParser from 'body-parser';
import moment from 'moment-timezone';
import {v4 as uuidv4} from 'uuid';
import macaddress from 'macaddress';
import os from 'os';

const app= express();
const PORT = 3500;

app.listen(PORT, ()=> {
    console.log(`Servidor iniciado en http://localhost ${PORT}`);
});

app.use(express.json()); //Habilita la comunicación ´por medio del body y entienda el estandar
app.use(express.urlencoded({extended: true}));

//Sesones almacenadas en Memoria RAM
const sessions= {};

app.use(
    session({
        secret: "P4-TIS#cabre-SesionesHTTP-VariableDeSesion",
        resave: false,
        saveUninitialized: true,
        cookie: {maxAge: 5*60*1000}
    })
)

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


//Endpoint de logueo
app.post('/login', async(req, res) =>{
    const {email, nickname, macAddress} = req.body;

    if(!email || !nickname ||!macAddress){
        return res.status(400).json({message: "Se esperan campos requeridos"})
    }

    const sessionId = uuidv4();
    const createdAt_CDMX = moment().tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss')

    req.session.email= email;
    req.session.sessionId=sessionId;
    req.session.nickname= nickname;
    req.session.macAddress= macAddress;
    req.session.createdAt= createdAt_CDMX;
    req.session.lastAccesed= createdAt_CDMX;
    req.session.serverIp= getLocal();
    req.session.serverMac= await getMac();

    sessions[sessionId] = req.session;
    
    res.status(200).json({
        message: "Se ha logueado exitosamente",
        sessionId
    });
})

app.post('/update', (req, res)=>{
    const {email, nickname} = req.body;

    if(!req.session.sessionId || !sessions[req.session.sessionId]){
        return res.status(400).json({message: "No existe una sesión activa"})
    }

    if(email) req.session.email = email;
    if(nickname) req.session.nickname= nickname;
    
    req.session.lastAccesed= moment().tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss')

    sessions[req.session.sessionId]= req.session;

    res.status(200).json({
        message: 'Datos actualizados', session: req.session
    })

})

app.get('/status', (req, res)=>{
    if(!req.session.sessionId || !sessions[req.session.sessionId]){
        return res.status(404).json({message: "No hay sesiones activa"})
    }

    const session= sessions[req.session.sessionId];
    const now= moment();
    const time=now.diff(moment(session.lastAccesed, 'YYYY/MM/DD HH:mm:ss'), 'seconds');
    const duration= now.diff(moment(session.createdAt, 'YYYY/MM/DD HH:mm:ss'), 'seconds');

    res.status(200).json({
        message: "Sesión Activa",
        session, 
        time: `${time} segundos`,
        duration: `${duration} segundos`
    })
})

app.get('/sessionAll', (req, res) => {
    if (Object.keys(sessions).length === 0) {
        return res.status(404).json({
            message: 'No hay sesiones activas'
        });
    }

    const formattedSessions = {};
    for (const sessionID in sessions) {
        const session = sessions[sessionID];
        formattedSessions[sessionID] = {
            ...session,
            createdAt: moment(session.createdAt).tz('America/Mexico_City').format('YYYY/MM/DD HH:mm:ss'),
            lastAccessed: moment(session.lastAccessed).tz('America/Mexico_City').format('YYYY/MM/DD HH:mm:ss')
        };
    }

    res.status(200).json({
        message: 'Sesiones activas',
        sessions: formattedSessions
    });
});

setInterval(() => {
    const now = moment();
    for (const sessionID in sessions) {
        const session = sessions[sessionID];
        const idleTime = now.diff(moment(session.lastAccessed, 'YYYY/MM/DD HH:mm:ss'), 'seconds');
        if (idleTime > 120) { // 2 minutos
            delete sessions[sessionID];
        }
    }
}, 60000);

app.post('/logout', (req, res)=>{

    if(!req.session.sessionId || !sessions[req.session.sessionId]){
        return res.status(404).json({message: "No se ha encontrado una sesión activa"});
    }

    delete sessions[req.session.sessionId];
    req.session.destroy((err)=>{
        if(err){
            return res.status(500).send('Error al cerrar sesión')
        };
    });
    res.status(200).json({message: "Logout successful"});
});

