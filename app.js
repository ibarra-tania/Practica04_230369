import express from 'express';
import session from 'express-session';
import bodyParser from 'body-parser';
import moment from 'moment-timezone';
import {v4 as uuidv4} from 'uuid';
import macaddress from 'macaddress';
import os from 'os';
import mongoose from 'mongoose';
import forge from 'node-forge';
import  Session  from './models.js';

const app= express();
const PORT = 3500;

mongoose.connect('mongodb+srv://tass:TantanC14AI@clustertania.6aqxg.mongodb.net/sessions_control_db?retryWrites=true&w=majority&appName=ClusterTania')
  .then((db) => console.log("Mongo connect"))
  .catch((error) => {
    console.error("Error connecting to MongoDB:", error);
    process.exit(1); // Detener la ejecución si no hay conexión a la base de datos
  });

const keypair = forge.pki.rsa.generateKeyPair(2048);
const publicKey = forge.pki.publicKeyToPem(keypair.publicKey);
const privateKey = forge.pki.privateKeyToPem(keypair.privateKey);

app.listen(PORT, ()=> {
    console.log(`Servidor iniciado en http://localhost ${PORT}`);
});

app.use(express.json()); //Habilita la comunicación ´por medio del body y entienda el estandar
app.use(express.urlencoded({extended: true}));


//Sesones almacenadas en Memoria RAM

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

const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded ? forwarded.split(',')[0] : req.connection.remoteAddress;
  return ip;
};

const encryptData = (data) => {
    const encrypted = keypair.publicKey.encrypt(data, 'RSA-OAEP');
    return forge.util.encode64(encrypted);
  };
  
//Endpoint de logueo
app.post('/login', async (req, res) => {
  try {
    const { email, nickname, macAddress } = req.body;
    if (!email || !nickname || !macAddress) {
      return res.status(400).json({ message: 'Se esperan campos requeridos' });
    }

    const sessionId = uuidv4();
    const createdAt_CDMX = moment().tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss');
    const serverIp = encryptData(getLocal() || '');
    const serverMac = encryptData(await getMac());
    const encryptedMacAddress = encryptData(macAddress);
    const clientIp = encryptData(getClientIp(req));

    const sessionData = new Session({
      sessionId,
      email,
      nickname,
      macAddress: encryptedMacAddress,
      createdAt: createdAt_CDMX,
      lastAccesed: createdAt_CDMX,
      serverIp,
      serverMac,
      clientIp,
      status: "Activa"
    });

    await sessionData.save();
    req.session.sessionId = sessionId;

    res.status(200).json({ message: 'Se ha logueado de manera exitosa', sessionId });
  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

app.post('/update', async (req, res) => {
  
    const { email, nickname } = req.body;

    if (!req.session.sessionId) {
      return res.status(400).json({ message: "No existe una sesión activa" });
    }

    const session = await Session.findOne({ sessionId: req.session.sessionId });

    if (!session) {
      return res.status(404).json({ message: "Sesión no encontrada" });
    }

    if (email) session.email = email;
    if (nickname) session.nickname = nickname;
    session.lastAccesed = moment().tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss');

    await session.save();
    res.status(200).json({ message: 'Actualización correcta', session });
});

app.post("/status", async(req,res)=>{
 const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(404).json({
      message: 'No existe una sesión activa'
    });
  }

  const session = await Session.findOne({ sessionId });
  if (!session) {
    return res.status(404).json({ message: 'Sesión no encontrada' });
  }

  const now = moment().tz('America/Mexico_City');
  const inactividad = now.diff(moment(session.lastAccesed).tz('America/Mexico_City'), 'minutes');
  const duracion = now.diff(moment(session.createdAt).tz('America/Mexico_City'), 'minutes');

  res.status(200).json({
    message: 'Sesión activa',
    session,
    inactividad: `${inactividad} minutos`,
    duracion: `${duracion} minutos`
  });
});

app.get('/sessionAll', async(req, res) => {
    
    const sessions = await Session.find({});

    if (sessions.length === 0) {
        return res.status(404).json({
            message: 'No hay sesiones activas'
        });
    }

        // Formatear las sesiones para la respuesta
        const now = moment().tz('America/Mexico_City');
        const formattedSessions = sessions.map(session => {
            const inactividad = now.diff(moment(session.lastAccesed).tz('America/Mexico_City'), 'minutes');
            return {
              ...session._doc,
              createdAt: moment(session.createdAt).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss'),
              lastAccessed: moment(session.lastAccessed).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss'),
              inactividad: `${inactividad} minutos`
            };
          });

        res.status(200).json({
            message: 'Sesiones activas',
            sessions: formattedSessions
        });
});


app.post('/logout', async(req, res)=>{
    const { sessionId } = req.session;

    if (!sessionId) {
        return res.status(404).json({
        message: 'No existe una sesión activa'
        });
    }

    await Session.updateOne({ sessionId }, { status: "Finalizada por el Usuario" });
    req.session.destroy();

    res.status(200).json({
        message: 'Logout exitoso'
    });
});

app.get('/currentSession', async (req, res) => {// sesiones actuales
    try {
      const activeSessions = await Session.find({ status: "Activa" });
  
      if (activeSessions.length === 0) {
        return res.status(404).json({ message: 'No hay sesiones activas' });
      }
  
      const formattedSessions = activeSessions.map(session => ({
        ...session._doc,
        createdAt: moment(session.createdAt).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss'),
        lastAccessed: moment(session.lastAccessed).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss'),
      }));
  
      res.status(200).json({ message: 'Sesiones activas', sessions: formattedSessions });
    } catch (error) {
      res.status(500).json({ message: 'Error al obtener sesiones activas', error });
    }
  });
  
  app.delete('/deleteAll', async (req, res) => {
    try {
      await Session.deleteMany({});
      res.status(200).json({ message: 'Se ha eliminado los registros de la base.' });
    } catch (error) {
      res.status(500).json({ message: 'Error', error });
    }
  });
  
  setInterval(async () => {
    const now = moment();
    const sessions = await Session.find();
    
    for (const session of sessions) {
      const lastAccessedMoment = moment(session.lastAccesed);
      const inactividad = now.diff(lastAccessedMoment, 'minutes');
      
      if (inactividad > 5) { 
        await Session.updateOne({ sessionId: session.sessionId }, { 
          status: `Inactiva por ${inactividad} minutos` 
        });
      }
    }
  }, 60000); 
