import express, {request, response} from 'express';
import session from 'express-session';
import bodyParser from 'body-parser';
import {v4 as uuidv4} from 'uuid';
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
        saveUninitialized: false,
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


//Endpoint de logueo
app.post('/login', (req, res) =>{
    const {email, nickname, macAddress} = req.body;

    if(!email || !nickname ||!macAddress){
        return res.status(400).json({message: "Se esperan campos requeridos"})
    }

    const sessionId = uuidv4();
    const now = new Date();

    session[sessionId] ={
        sessionId,
        email,
        nickname,
        macAddress,
        ip : getLocal(req),
        createAt: now,
        lastAcceses: now

    };
    
    res.status(200).json({
        message: "Se ha logueado exitosamente",
        sessionId
    });
})

app.post('/logout', (req, res)=>{
    const {sessionId} = req.body;

    if(!sessionId || !sessions[sessionId]){
        return res.status(404).json({message: "No se ha encontrado una sesión activa"});
    }

    delete session[sessionId];
    req.session.destroy((err)=>{
        if(err){
            return res.status(500).send('Error al cerrar sesión')
        };
    });
    res.status(200).json({message: "Logouto successful"});
});

app.post('/update', (req, res)=>{
    const {sessionId, email, nickname} = req.body;

    if(!sessionId || !sessions[sessionId]){
        return res.status(400).json({message: "No existe una sesión activa"})
    }

    if(email) sessions[sessionId].email = email;
    if(nickname) sessions[sessionId].nickname= nickname;
        IdleDeadline()
    sessions[sessionId].lastAcceses = new Date();

})

app.get('/status', (req, res)=>{
    const sessionId = req.query.sessionId;
    if(!sessionId || !sessions[sessionId]){
        res.status(404).json({message: "No hay sesiones activas"})
    }

    res.status(200).json({
        message: "Sesión Activa",
        session: sessions[sessionId]
    })
})



