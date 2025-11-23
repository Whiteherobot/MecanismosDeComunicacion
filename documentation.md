# Documentación Técnica del Sistema de Monitoreo

Este documento detalla la arquitectura y el funcionamiento de los componentes clave del sistema de monitoreo de sensores.

---

### a) Nombre del archivo
`sensor_producer.py`

### b) Resumen del propósito del archivo
Este script simula la generación de datos de diversos sensores (temperatura, movimiento, etc.) y los publica como mensajes en una cola de RabbitMQ. Su función es actuar como un productor de eventos para alimentar el sistema de monitoreo, imitando el comportamiento de dispositivos IoT en un entorno real.

### c) Explicación de cada bloque importante con comentario técnico

#### Bloque 1: Función `generar_evento()`
```python
def generar_evento():
    tipos = ["temperatura", "puerta", "movimiento", "humo", "vibracion", "alarma_manual"]
    tipo = random.choice(tipos)
    sensor_id = f"S-{random.randint(100, 199)}"
    now = datetime.now(timezone.utc).isoformat()

    if tipo == "temperatura":
        valor = round(random.uniform(20, 60), 1)
    # ... (lógica similar para otros tipos) ...

    evento = {
        "sensor_id": sensor_id,
        "tipo": tipo,
        "valor": valor,
        "timestamp": now
    }
    return evento
```
- **Explicación técnica:** La función crea un evento de sensor simulado. Selecciona aleatoriamente un `tipo` de sensor de una lista predefinida y genera un `valor` apropiado para ese tipo. Cada evento incluye un identificador de sensor (`sensor_id`) y una marca de tiempo (`timestamp`) en formato ISO 8601 con zona horaria UTC.
- **Justificación de librerías:** Utiliza la librería `random` para la simulación de datos variables y `datetime` para generar marcas de tiempo precisas y estandarizadas, lo cual es fundamental para el procesamiento de series temporales.
- **Tipos de datos:** La función no recibe parámetros y devuelve un diccionario de Python que representa el evento del sensor. Este diccionario está diseñado para ser fácilmente serializable a JSON.

#### Bloque 2: Función `main()`
```python
def main():
    conn, ch = conectar_rabbit()
    ch.queue_declare(queue=QUEUE_NAME, durable=True)

    try:
        while True:
            evento = generar_evento()
            body = json.dumps(evento)
            ch.basic_publish(
                exchange='',
                routing_key=QUEUE_NAME,
                body=body,
                properties=pika.BasicProperties(
                    delivery_mode=2  # mensaje persistente
                )
            )
            # ...
            time.sleep(random.uniform(0.5, 3.0))
    # ...
```
- **Explicación técnica:** El bucle principal del script genera y publica eventos continuamente. Antes de publicar, establece una conexión con RabbitMQ y declara una cola `durable`, asegurando que la cola sobreviva a reinicios del broker.
- **Procesos de comunicación:** Utiliza `ch.basic_publish` para enviar el evento a la cola `sensores_mon`. El mensaje se serializa a una cadena JSON. La propiedad `delivery_mode=2` marca el mensaje como persistente, indicando a RabbitMQ que debe guardarlo en disco. Esto garantiza que el mensaje no se pierda si el broker se reinicia antes de que un consumidor lo procese. El `time.sleep` con un intervalo aleatorio simula una frecuencia de envío no constante.

### d) Conexión del archivo con el resto del proyecto
- **Salida:** Publica mensajes en la cola `sensores_mon` de RabbitMQ.
- **Dependencia:** Es el punto de entrada de datos para `alert_processor.py`, que actúa como consumidor de esta cola. El productor no tiene conocimiento directo del consumidor, lo que demuestra un desacoplamiento efectivo.

### e) Recomendaciones técnicas opcionales
1.  **Simulación más realista:** Los rangos de valores generados son amplios y puramente aleatorios. Para pruebas más efectivas, se podrían simular escenarios específicos (e.g., un aumento gradual de temperatura) para verificar que la lógica de `alert_processor.py` reacciona correctamente.
2.  **Configuración externalizada:** Al igual que en `alert_processor.py`, las constantes `RABBITMQ_HOST` y `QUEUE_NAME` deberían ser cargadas desde variables de entorno para mejorar la flexibilidad.

---

### a) Nombre del archivo
`alert_processor.py`

### b) Resumen del propósito del archivo
Este script actúa como un consumidor de mensajes de la cola de RabbitMQ. Su función principal es recibir eventos de sensores, procesarlos para determinar un nivel de alerta y un mensaje descriptivo, y finalmente, enviar esta información procesada a un servidor WebSocket a través de un endpoint HTTP.

### c) Explicación de cada bloque importante con comentario técnico

#### Bloque 1: Función `clasificar_alerta(evento)`
```python
def clasificar_alerta(evento):
    tipo = evento.get("tipo")
    valor = evento.get("valor")
    # ...
    if tipo == "temperatura":
        if valor < 35:
            nivel = "verde"
            # ...
        elif 35 <= valor <= 45:
            nivel = "amarillo"
            # ...
        else:
            nivel = "rojo"
            # ...
    # ... (reglas para otros tipos de sensor) ...
    alerta_procesada = { ... }
    return alerta_procesada
```
- **Explicación técnica:** Contiene la lógica de negocio para clasificar los datos crudos de los sensores. Utiliza una estructura condicional (`if/elif`) para aplicar reglas predefinidas basadas en el `tipo` y `valor` del evento, asignando un `nivel` de severidad (`verde`, `amarillo`, `rojo`) y un `mensaje` descriptivo.
- **Tipos de datos:** Recibe un diccionario (`evento`) y devuelve un diccionario (`alerta_procesada`) enriquecido con la clasificación.
- **Justificación:** Centraliza la lógica de decisión, facilitando la modificación de umbrales y la adición de nuevas reglas.

#### Bloque 2: Función `enviar_a_ws(alerta)`
```python
def enviar_a_ws(alerta):
    try:
        resp = requests.post(WS_BRIDGE_URL, json=alerta, timeout=2)
        if resp.status_code != 200:
            print(f"[MON-Processor] Error enviando a WS Server: {resp.status_code} {resp.text}")
    except Exception as e:
        print(f"[MON-Processor] Excepción enviando a WS Server: {e}")
```
- **Explicación técnica:** Realiza una solicitud HTTP POST al endpoint `WS_BRIDGE_URL`. La alerta procesada se serializa a JSON y se envía en el cuerpo de la solicitud.
- **Justificación de librerías:** Usa `requests` por su simplicidad y robustez para realizar solicitudes HTTP.
- **Manejo de errores:** Captura excepciones de red y verifica el código de estado de la respuesta para registrar fallos en la comunicación, lo cual es fundamental para la fiabilidad del sistema.

#### Bloque 3: Función `main()` y `callback`
```python
def callback(ch, method, properties, body):
    evento = json.loads(body.decode("utf-8"))
    alerta = clasificar_alerta(evento)
    enviar_a_ws(alerta)
    ch.basic_ack(delivery_tag=method.delivery_tag)

def main():
    # ... configuración de pika ...
    channel.basic_qos(prefetch_count=1)
    channel.basic_consume(queue=QUEUE_NAME, on_message_callback=callback)
    channel.start_consuming()
```
- **Explicación técnica:** `main` configura la conexión con RabbitMQ, y `callback` es la función que se ejecuta por cada mensaje. `basic_qos(prefetch_count=1)` asegura que el consumidor solo procese un mensaje a la vez. El `basic_ack` es crucial: notifica a RabbitMQ que el mensaje fue procesado con éxito, permitiendo que sea eliminado de la cola. Si el script falla antes del `ack`, el mensaje será re-entregado.

### d) Conexión del archivo con el resto del proyecto
- **Entrada:** Consume mensajes de la cola `sensores_mon` de RabbitMQ, publicados por `sensor_producer.py`.
- **Salida:** Envía las alertas procesadas mediante una solicitud HTTP POST a `ws_server.js` en el endpoint `/alert`.
- **Middleware:** RabbitMQ desacopla al productor del consumidor, mejorando la escalabilidad y resiliencia.

### e) Recomendaciones técnicas opcionales
1.  **Configuración externalizada:** Las constantes (`RABBITMQ_HOST`, `WS_BRIDGE_URL`) deberían externalizarse a variables de entorno.
2.  **Manejo de "mensajes envenenados":** Implementar una "Dead Letter Queue" (DLQ) para mover mensajes malformados que causan errores persistentes, evitando el bloqueo del consumidor.
3.  **Refactorización de `clasificar_alerta`:** Para un sistema con más reglas, se podría refactorizar la lógica `if/elif` a un patrón de diseño Strategy (diccionario de funciones) para mejorar la mantenibilidad.

---

### a) Nombre del archivo
`ws_server.js`

### b) Resumen del propósito del archivo
Este script implementa un servidor dual: un servidor HTTP (usando Express.js) y un servidor WebSocket (usando la librería `ws`). Su propósito es actuar como un puente. Recibe alertas procesadas desde `alert_processor.py` a través de un endpoint HTTP y las retransmite en tiempo real a todos los clientes (operadores) conectados vía WebSocket.

### c) Explicación de cada bloque importante con comentario técnico

#### Bloque 1: Gestión de conexiones WebSocket
```javascript
const wss = new WebSocket.Server({ server });
let clients = new Set();

wss.on("connection", (ws) => {
  console.log("[WS Server] Nuevo operador conectado");
  clients.add(ws);

  ws.on("close", () => {
    console.log("[WS Server] Operador desconectado");
    clients.delete(ws);
  });
});
```
- **Explicación técnica:** Se instancia un servidor WebSocket (`wss`) asociado al servidor HTTP. Se utiliza un `Set` para almacenar las conexiones de los clientes activos. El uso de un `Set` es eficiente y previene duplicados. Los manejadores de eventos `connection` y `close` gestionan el ciclo de vida de las conexiones, añadiendo y eliminando clientes del `Set` según corresponda.

#### Bloque 2: Endpoint HTTP para recibir alertas
```javascript
app.post("/alert", (req, res) => {
  const alerta = req.body;
  console.log("[WS Server] Alerta recibida para difundir:", alerta);

  const data = JSON.stringify(alerta);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }

  res.status(200).send("Alert broadcasted");
});
```
- **Explicación técnica:** Define un endpoint HTTP en la ruta `/alert` que acepta solicitudes POST. Cuando `alert_processor.py` envía una alerta, esta es recibida aquí. El servidor itera sobre todos los clientes WebSocket conectados y difunde (`broadcast`) la alerta a cada uno de ellos.
- **Procesos de comunicación:** Este bloque es el núcleo del "puente". Traduce una comunicación HTTP (request-response) en una comunicación WebSocket (push en tiempo real). La verificación `client.readyState === WebSocket.OPEN` es una buena práctica para asegurar que solo se envíen mensajes a clientes con conexiones activas.
- **Justificación de librerías:** `express` se utiliza para crear el servidor HTTP de forma sencilla, `body-parser` para extraer el cuerpo JSON de la solicitud POST, y `ws` es una de las librerías más populares y eficientes para implementar servidores WebSocket en Node.js.

### d) Conexión del archivo con el resto del proyecto
- **Entrada:** Recibe solicitudes HTTP POST en el endpoint `/alert` desde `alert_processor.py`.
- **Salida:** Envía mensajes a través de conexiones WebSocket a cualquier cliente que se conecte (e.g., una interfaz de navegador no incluida en este proyecto).
- **Rol:** Es el componente final de la cadena de procesamiento, responsable de la entrega de alertas en tiempo real a los usuarios finales.

### e) Recomendaciones técnicas opcionales
1.  **Autenticación y autorización:** El servidor WebSocket actual es abierto; cualquier cliente puede conectarse. En un entorno de producción, sería indispensable implementar un mecanismo de autenticación (e.g., basado en tokens JWT) en el evento `connection` para asegurar que solo operadores autorizados puedan recibir las alertas.
2.  **Escalabilidad:** El `Set` de clientes se almacena en la memoria de una única instancia del servidor. Si el sistema necesitara escalar a múltiples instancias de `ws_server.js`, este enfoque no funcionaría, ya que cada instancia tendría su propia lista de clientes. Para un sistema distribuido, se necesitaría un mecanismo de Pub/Sub externo (como Redis) para gestionar la difusión de mensajes a través de todas las instancias.
