# Abandonment sequences: people who finished the onboarding questions but did not pay.
# One sequence per main goal. Variables: {nombre}, {objetivo}. Blocks shown only when they apply:
# [[sin_proc]] only natural changes, [[proc]] open to procedures, [[cirugia]] open to surgery,
# [[presupuesto_bajo]] budget under $2,000 MXN. {boton:Text} is the button to finish the analysis.
# Style: short lines, lots of air, close and direct (same feel as the Primordial Men sequences).
DIAS = [0, 1, 2, 4, 6, 9, 13]

SEC = {}

SEC["general"] = ("General (todas las personas)", [
("lo que nadie te va a decir", """{nombre}, hay algo que casi nadie sabe de su propia cara.

La gente que te quiere nunca te va a decir qué te favorece y qué no. Por cariño, por pena o porque ni ellos lo saben explicar.

Y tú tampoco lo puedes ver bien.

En 1977 unos psicólogos descubrieron algo raro: las personas prefieren su cara como la ven en el espejo, al revés. Sus amigos prefieren la foto normal.

Nos acostumbramos tanto a nuestra cara que dejamos de verla.

Mientras tanto, todos los demás sí la ven. Tu jefe, la persona que te entrevista, alguien que ve tu foto en una app, alguien que te conoce en una fiesta. Todos se forman una idea de ti antes de que digas nada.

Tú eres la única persona que no sabe qué ven.

Por eso es tan difícil saber, solo mirándote, qué te está sumando y qué te está restando.

En Resalta no tenemos ni cariño ni pena. Medimos tu cara, te decimos lo que hay con números y te decimos qué hacer con eso.

Tus respuestas siguen guardadas. Te falta muy poco.

{boton:Terminar mi análisis}"""),
("el impuesto que nadie ve", """{nombre}, esto es incómodo, pero está medido.

Hay un impuesto que casi nadie sabe que paga. No sale en ningún recibo y nadie te lo cobra de frente. Se cobra en cómo te ven.

Empecemos por el dinero.

El economista Daniel Hamermesh lleva más de 30 años estudiando esto. Comparó a miles de personas con edad, estudios y trabajos parecidos. Lo único que cambiaba era cómo se veían.

{dato:$230 mil|Dólares que gana de más en toda su vida laboral una persona atractiva frente a una poco atractiva con la misma preparación}

Dicho fácil: dos personas hacen el mismo trabajo igual de bien. La que se ve mejor puede ganar hasta 15% más cada año. Le dan más entrevistas, más aumentos y más ascensos.

Y el dinero es lo de menos.

Con la gente pasa lo mismo. Los psicólogos lo llaman efecto halo: cuando alguien nos parece atractivo, asumimos sin darnos cuenta que también es más amable, más inteligente y más confiable.

Y lo decidimos rápido. En Princeton midieron que nos formamos esa impresión de una cara en una décima de segundo.

Antes de que digas una palabra, ya decidieron cuánto te van a escuchar.

En el amor es todavía más claro.

OkCupid, una de las apps de citas más grandes, analizó los datos de sus usuarios. Los hombres mejor calificados por su foto recibían unas 11 veces más mensajes que los peor calificados. En las mujeres la diferencia era de 25 veces.

Misma app, mismas reglas. La cara decidía quién recibía mensajes y quién no.

Eso se traduce en más citas, más segundas citas y más opciones para elegir pareja en lugar de conformarte.

No es justo. Pero pasa todos los días, lo veas o no.

Ahora la parte que casi nadie cuenta, y que es la buena noticia.

La diferencia casi nunca está entre gente "guapa" y gente "fea". Está en detalles. Una piel uniforme. Unas cejas que acompañan los ojos. Un corte que equilibra la cara. Una mandíbula que se nota. Una foto tomada desde el ángulo que te favorece.

Cosas que se pueden ajustar. La mayoría sin gastar mucho y sin tocarte nada.

El problema es saber cuáles son las tuyas. A simple vista nadie lo sabe.

Para eso existe Resalta. Revisamos más de 110 rasgos de tu cara y te decimos qué te está restando puntos y qué hacer primero.

Ya contestaste las preguntas. Solo te falta terminar.

{boton:Ver qué me está restando}

P.D. Piensa cuántas veces al día alguien decide algo sobre ti por tu cara. En una entrevista, en una app, en una reunión, en la calle. Cada una cuenta."""),
("por qué no te ha funcionado", """Si alguna vez seguiste un consejo de belleza y no notaste nada, no es tu culpa.

Los consejos que circulan están hechos para una cara promedio. Y la tuya no lo es.

"Cejas gruesas", "barba de candado", "rubor en las mejillas". Lo que a una cara le suaviza, a otra la endurece. Lo que a una le da forma, a otra la alarga.

Por eso tanta gente gasta en productos, cortes y tutoriales que no le cambian nada. No hacían nada mal. Estaban siguiendo la receta de otra cara.

Por eso en Resalta medimos primero.

{imagen:/assets/img/email/medidas.jpg}

Revisamos más de 110 rasgos de tu cara con tus fotos de frente, sonriendo y de perfil. Tu simetría, tus tercios, tus ángulos, tu piel, tu edad visual.

Y con eso te decimos tres cosas:

Qué te favorece y conviene resaltar.
Qué te está restando y cómo se corrige.
Qué no vale la pena tocar, aunque esté de moda.

Es la diferencia entre adivinar y saber.

{boton:Terminar mi análisis}"""),
("tres cambios", """En casi cualquier cara pasa lo mismo.

De todo lo que se podría mejorar, hay dos o tres cosas que hacen casi toda la diferencia. El resto apenas se nota.

{imagen:/assets/img/email/tercios.jpg}

Y casi siempre son cambios sencillos, que no cuestan mucho dinero.

Un corte que equilibra los tercios de tu cara. Unas cejas con la forma correcta para tus ojos. Una rutina de piel sencilla. Bajar un poco de grasa en la cara.

Lo difícil nunca fue hacer los cambios.

Lo difícil es saber cuáles son, en tu cara, y en qué orden.

Hacer diez cosas a medias no se nota. Hacer bien las tres correctas se nota en semanas, y la gente empieza a decirte "te ves bien" sin saber qué cambió.

Eso es lo que te damos en Resalta: lo primero que conviene hacer, lo segundo, y lo que puedes ignorar.

{boton:Ver mis tres cambios}"""),
("lo que cuesta adivinar", """Pasa más de lo que crees.

Alguien gasta en un tratamiento, una crema carísima o un procedimiento, y no queda como esperaba.

Casi siempre el problema no fue el producto ni el doctor.

Fue empezar por la solución sin entender primero su cara.

Un relleno donde no hacía falta. Unas cejas que endurecieron la mirada. Un corte que alargó todavía más una cara larga.

Equivocarse en algo así cuesta dinero. Un corte malo tarda meses en crecer. Un tratamiento mal elegido no se devuelve.

Y casi todos esos errores se evitan sabiendo una sola cosa: qué necesita tu cara y qué no.

[[proc]]Si estás pensando en algún procedimiento, en Resalta te decimos qué tiene sentido en tu cara, qué preguntar en la consulta y qué no necesitas aunque te lo ofrezcan.

[[/proc]]Medir antes cuesta menos que corregir después.

{boton:Medir antes de gastar}"""),
("¿y si sale bajo?", """Mucha gente no termina su análisis por miedo a una cosa:

"¿Y si me sale bajo?"

Te decimos cómo lo vemos.

Un número no dice cuánto vales. Dice dónde estás hoy y cuánto margen tienes.

Y las caras con el número más bajo casi siempre son las que más pueden mejorar, porque tienen más cosas fáciles por ajustar.

Piénsalo así: tu cara ya es la que es, la midas o no. Lo único que cambia al medirla es que dejas de adivinar.

Lo que de verdad no ayuda es quedarse con la duda. Seguir mirándote sin entender qué es lo que no te convence.

En Resalta no estamos para juzgarte. Estamos para decirte qué hacer primero.

{boton:Ver qué hacer primero}"""),
("vamos a ser directos", """{nombre}, este es el último correo que te mandamos sobre esto. Así que vamos a ser directos.

Ya hiciste la parte difícil. Contestaste las preguntas. Te importó lo suficiente para empezar.

Y te detuviste justo antes de la respuesta.

Casi siempre es por una de tres razones.

"Lo hago después."
Después casi nunca llega. Dentro de 90 días vas a tener la misma cara y la misma duda, a menos que hagas algo distinto.

"No sé si vale la pena."
Suma lo que ya gastaste en productos, cortes o tratamientos que no cambiaron nada. Saber qué hacer cuesta menos que seguir adivinando.

"Me da miedo lo que salga."
El resultado no cambia tu cara. Ya es la que es. Lo único que cambia es que por fin sabes qué hacer con ella.

Mientras lo piensas, el impuesto del que te hablamos se sigue cobrando. En cada entrevista, en cada foto de perfil, en cada primera impresión.

En Resalta te damos tus puntos fuertes, lo que te está restando y un plan de 90 días, paso por paso, hecho para tu cara.

La gente que se ve bien no tuvo suerte. Sabe qué le queda.

Hoy puedes saberlo tú.

{boton:Terminar mi análisis}

P.D. Tus respuestas siguen guardadas. Entras desde resalta.co con tu correo y empiezas donde lo dejaste."""),
])

SEC["joven"] = ("Verme más joven", [
("Te quedaste a un paso, {nombre}", """{nombre}, vi que contestaste todo pero no terminaste tu análisis.

Nos dijiste que quieres verte más joven.

Y quiero que sepas algo:

Casi nadie sabe qué edad aparenta de verdad.

Unos se ven mayores de lo que son y no saben por qué.
Otros se ven más jóvenes y no saben qué están haciendo bien.

Tu análisis te dice tu edad visual contra tu edad real.
Y qué rasgos te están sumando años.

Tus respuestas siguen guardadas. Te faltan solo las fotos.

{boton:Ver mi edad visual}"""),
("No son las arrugas", """{nombre}, esto sorprende a casi todos:

Lo que más años le suma a una cara no son las arrugas.

Es la pérdida de contraste.

Piel opaca.
Ojeras marcadas.
Cejas que bajan.
Labios que pierden definición.
Un contorno de mandíbula que se borra.

Y aquí viene la buena noticia:

Varias de esas cosas se mejoran sin tocar nada.
Con rutina, hábitos y saber dónde poner atención.

La pregunta es cuáles aplican a TU cara.

Eso es lo que medimos.

{boton:Terminar mi análisis}"""),
("Hay tres caminos", """{nombre}, cuando alguien quiere verse más joven, suele tomar uno de tres caminos:

1. Comprar cremas.
La que recomienda la influencer, la que está de oferta, la que promete todo. Sin saber qué necesita su piel.

2. Ir directo a un tratamiento.
Caro. Y muchas veces atacando lo que no era lo más importante.

3. Medir primero.
Saber qué zona de tu cara está envejeciendo antes y qué conviene atender en qué orden.

El tercero ahorra dinero, tiempo y errores.

Es el que empezaste.

{boton:Terminar mi análisis}"""),
("Lo que vas a ver cuando termines", """{nombre}, esto es lo que hay del otro lado:

Tu edad visual contra tu edad real.
La edad que podrías aparentar siguiendo tu plan.
Tu calificación por zona.
Qué rasgos te quitan años y cuáles te los suman.
Una rutina para tu tipo de piel.
Y un plan de 90 días, paso a paso.
[[presupuesto_bajo]]
Y casi todo lo que funciona es barato. No necesitas una rutina de miles de pesos.
[[/presupuesto_bajo]]
Todo con más de 110 rasgos medidos en tus fotos.

{boton:Ver mi análisis}"""),
("Un ejemplo", """{nombre}, te pongo un ejemplo típico.

Alguien de 41 años. Siempre le dicen que se ve con cara de cansancio, aunque haya dormido bien.

Cree que necesita algo para las arrugas.

Mide su cara y lo que más le suma años son las ojeras y unas cejas muy delgadas que dejaron de enmarcar su mirada.

Deja crecer las cejas. Ajusta su sueño y la sal en la noche. Protector solar diario.

Tres meses después, ya nadie le pregunta si durmió mal.

No se hizo nada.

Solo atendió lo que de verdad importaba en su cara.

{boton:Terminar mi análisis}"""),
("Lo que más nos preguntan", """{nombre}, las dudas que casi todos tienen:

"¿De verdad me van a decir qué edad aparento?"
Sí. Y por qué: qué rasgos la suben y cuáles la bajan.

"¿Sirve si ya tengo más de 40 o 50?"
Sí. De hecho es cuando más se nota un buen plan.

"¿Quién ve mis fotos?"
Nadie más. Las borras cuando quieras desde tu cuenta.
[[sin_proc]]
"¿Me van a mandar a hacerme algo?"
No. Nos dijiste que prefieres cambios naturales. Tu plan se queda en eso.
[[/sin_proc]]
[[proc]]
"¿Hablan de tratamientos?"
Sí, como información para que llegues con tu médico sabiendo qué preguntar. Nunca como receta.
[[/proc]]
{boton:Terminar mi análisis}"""),
("Último correo sobre esto", """{nombre}, este es el último correo que te mando sobre tu análisis.

Cada mes que pasa sin saber qué hacer es un mes que la cara sigue cambiando.

Puedes seguir probando productos al azar.

O puedes saber, hoy, qué te está sumando años y qué hacer al respecto.

Tus respuestas siguen guardadas.

{boton:Ver mi edad visual}

Aquí estaremos cuando quieras.
Resalta"""),
])

SEC["mandibula"] = ("Mandíbula y perfil", [
("Te quedaste a un paso, {nombre}", """{nombre}, vi que contestaste todo pero no terminaste tu análisis.

Nos dijiste que te importa tu mandíbula y tu perfil.

Es de lo que más se puede medir:
el ángulo de tu mandíbula, tu mentón, tu cuello y la línea completa de tu perfil.

Y casi siempre la respuesta sorprende.

Porque mucha gente cree que es un problema de hueso…

…y no lo es.

Tus respuestas siguen guardadas. Te faltan solo las fotos.

{boton:Medir mi perfil}"""),
("Casi nunca es el hueso", """{nombre}, en la mayoría de las caras lo que esconde la mandíbula no es la estructura.

Es esto:

Grasa en papada y cuello.
La cabeza adelantada por pasar horas en el celular.
Cómo descansas la lengua y la boca.

Por eso hay gente que cambia su perfil por completo sin tocar nada.

Y gente que se opera y no ve la diferencia que esperaba.

La clave es saber cuánto de tu perfil depende de tu estructura y cuánto de lo demás.

Eso es lo que medimos.

{boton:Terminar mi análisis}"""),
("Hay tres caminos", """{nombre}, cuando alguien quiere una mandíbula más marcada, suele tomar uno de tres caminos:

1. Videos de "mewing" y ejercicios de mandíbula.
Meses haciéndolo sin saber si es lo que necesita.

2. Ir directo a rellenos o cirugía.
Caro. Y a veces innecesario.

3. Medir primero.
Saber con números cómo está tu ángulo, tu mentón y tu perfil, y qué conviene hacer primero.

El tercero es el único donde decides con información.

Es el que empezaste.

{boton:Terminar mi análisis}"""),
("Lo que vas a ver cuando termines", """{nombre}, esto es lo que hay del otro lado:

El ángulo de tu mandíbula y tu mentón, comparados con rangos de referencia.
Tu perfil completo, de la frente a la barbilla.
Tu calificación por zona.
Qué parte de tu perfil depende de estructura y qué parte no.
Lo que más te suma cambiar primero.
Y un plan de 90 días, paso a paso.
[[presupuesto_bajo]]
Antes de gastar en cualquier tratamiento, conviene saber si de verdad lo necesitas. Muchas veces no.
[[/presupuesto_bajo]]
Todo con más de 110 rasgos medidos.

{boton:Ver mi análisis}"""),
("Un ejemplo", """{nombre}, te pongo un ejemplo típico.

Alguien de 27 años. Siente que no tiene mandíbula. Ya estaba viendo precios de rellenos.

Mide su perfil y su estructura está bien.

Lo que borra su mandíbula es la postura, con la cabeza adelantada, y algo de grasa en la papada.

Trabaja la postura. Baja grasa poco a poco. Aprende a pararse y a posar.

En unos meses su perfil se ve distinto.

Se ahorró un tratamiento que no necesitaba.

{boton:Terminar mi análisis}"""),
("Lo que más nos preguntan", """{nombre}, las dudas que casi todos tienen:

"¿Necesito foto de perfil?"
Sí, y te guiamos para tomarla bien con tu celular.

"¿Me van a decir si mi mandíbula es buena?"
Te damos la medida contra rangos de referencia, y qué tanto se puede mejorar.

"¿Quién ve mis fotos?"
Nadie más. Las borras cuando quieras.
[[sin_proc]]
"¿Me van a mandar a cirugía?"
No. Nos dijiste que prefieres cambios naturales. Tu plan se queda en eso.
[[/sin_proc]]
[[cirugia]]
"¿Y si sí quiero saber de procedimientos?"
El plan Completo te explica qué se suele considerar para mandíbula y mentón, qué hace cada uno y qué preguntar antes. Mejor saberlo antes de pagar una consulta.
[[/cirugia]]
{boton:Terminar mi análisis}"""),
("Último correo sobre esto", """{nombre}, este es el último correo que te mando sobre tu análisis.

Así que te lo digo directo:

Puedes seguir viendo videos de mandíbula.
O cotizando tratamientos sin saber si los necesitas.

O puedes saber, en 10 minutos, exactamente cómo está tu perfil y qué hacer.

Tus respuestas siguen guardadas.

{boton:Medir mi perfil}

Aquí estaremos cuando quieras.
Resalta"""),
])

SEC["piel"] = ("Piel", [
("Te quedaste a un paso, {nombre}", """{nombre}, vi que contestaste todo pero no terminaste tu análisis.

Nos dijiste que quieres mejorar tu piel.

Y te voy a decir algo que casi nadie dice:

La mayoría de la gente con problemas de piel no necesita más productos.

Necesita los correctos. En el orden correcto.

Tu análisis revisa textura, tono, manchas, poros y ojeras en tus fotos, y te arma la rutina para tu piel.

Tus respuestas siguen guardadas. Te faltan solo las fotos.

{boton:Terminar mi análisis}"""),
("Más productos no es mejor piel", """{nombre}, el error más común con la piel es este:

Usar demasiado.

Limpiadores fuertes.
Exfoliantes todos los días.
Cinco sérums a la vez.

Y la piel termina irritada, roja, con más granos o más grasa.

Casi siempre gana una rutina corta y constante:
Limpiar suave. Hidratar. Protector solar.

Y luego agregar solo lo que tu piel necesita.

La pregunta es qué necesita la tuya.

{boton:Ver mi rutina}"""),
("Hay tres caminos", """{nombre}, cuando alguien quiere mejorar su piel, suele tomar uno de tres caminos:

1. Comprar lo que recomienda alguien en redes.
Que tiene otra piel, otro clima y otro presupuesto.

2. Ir directo a tratamientos caros.
Sin haber resuelto lo básico primero.

3. Ver primero qué tiene tu piel.
Y armar una rutina para eso, no para la de otra persona.

El tercero ahorra dinero y frustración.

Es el que empezaste.

{boton:Terminar mi análisis}"""),
("Lo que vas a ver cuando termines", """{nombre}, esto es lo que hay del otro lado:

Cómo está tu piel: textura, tono, manchas, ojeras y brillo.
Tu calificación por zona.
Una rutina de mañana y noche para tu tipo de piel.
Los colores que más te iluminan la cara.
Y un plan de 90 días, paso a paso.
[[presupuesto_bajo]]
Y una buena rutina no tiene que ser cara. Te decimos qué buscar, no marcas de lujo.
[[/presupuesto_bajo]]
Todo con más de 110 rasgos medidos en tus fotos.

{boton:Ver mi análisis}"""),
("Un ejemplo", """{nombre}, te pongo un ejemplo típico.

Alguien de 24 años. Granos en la frente y la piel grasosa. Ya probó de todo.

Resulta que estaba usando un limpiador tan fuerte que su piel producía más grasa para defenderse.

Cambia a un limpiador suave. Agrega hidratante y protector solar. Deja de exfoliarse diario.

Seis semanas después, su piel está más tranquila que en años.

Gastó menos que antes.

Solo dejó de pelear contra su piel.

{boton:Terminar mi análisis}"""),
("Lo que más nos preguntan", """{nombre}, las dudas que casi todos tienen:

"¿Se alcanza a ver la piel en una foto de celular?"
Sí, con buena luz natural. Te guiamos para tomarla.

"¿Me van a diagnosticar algo?"
No. Es un análisis estético. Si vemos algo que conviene revisar con un dermatólogo, te lo decimos.

"¿Quién ve mis fotos?"
Nadie más. Las borras cuando quieras.
[[proc]]
"¿Hablan de tratamientos?"
Sí, como información para que llegues con tu dermatólogo sabiendo qué preguntar. Nunca como receta.
[[/proc]]
{boton:Terminar mi análisis}"""),
("Último correo sobre esto", """{nombre}, este es el último correo que te mando sobre tu análisis.

Puedes seguir comprando productos a ver cuál sí funciona.

O puedes saber, hoy, qué necesita tu piel y qué le sobra.

Tus respuestas siguen guardadas.

{boton:Ver mi rutina}

Aquí estaremos cuando quieras.
Resalta"""),
])

SEC["rasgos"] = ("Cabello, cejas, vello facial y ojos", [
("Te quedaste a un paso, {nombre}", """{nombre}, vi que contestaste todo pero no terminaste tu análisis.

Nos dijiste que quieres mejorar {objetivo}.

Son de los cambios que más se notan.
Y de los más rápidos.

Pero solo si sabes qué forma le va a tu cara.

Porque el mismo corte que a alguien le queda increíble, a otra persona le alarga la cara o le ensancha la frente.

Tus respuestas siguen guardadas. Te faltan solo las fotos.

{boton:Terminar mi análisis}"""),
("El marco de tu cara", """{nombre}, el cabello, las cejas y la barba son el marco de tu cara.

Y un marco equivocado arruina hasta la mejor foto.

Un corte que no va con tus proporciones puede esconder tu mejor rasgo.
Unas cejas mal formadas cambian la mirada completa.
Una barba en el lugar equivocado puede ensanchar o alargar la cara.

Por eso no existe "el corte que le queda a todos".

Depende de la forma de tu cara y de tus medidas.

Eso es lo que medimos.

{boton:Ver qué me favorece}"""),
("Hay tres caminos", """{nombre}, cuando alguien quiere cambiar su corte o su estilo, suele tomar uno de tres caminos:

1. Enseñarle al barbero o estilista la foto de alguien más.
Que tiene otra cara.

2. Dejarse llevar por lo que está de moda.
Aunque no le favorezca.

3. Saber primero qué forma tiene su cara.
Y qué estilos le van a sus proporciones.

El tercero es el único que funciona a la primera.

Es el que empezaste.

{boton:Terminar mi análisis}"""),
("Lo que vas a ver cuando termines", """{nombre}, esto es lo que hay del otro lado:

Tu tipo de cara, medido.
Los cortes y estilos que te favorecen, para enseñárselos a tu barbero o estilista.
La forma de ceja que mejor va con tus ojos.
Qué hacer con la barba o el vello facial.
Tu calificación por zona.
Y un plan de 90 días, paso a paso.

Todo con más de 110 rasgos medidos en tus fotos.

{boton:Ver mi análisis}"""),
("Un ejemplo", """{nombre}, te pongo un ejemplo típico.

Alguien de 33 años. Siempre se corta igual. Siente que se ve "normal", nada más.

Mide su cara: es más ancha que larga, y su corte, rapado a los lados y plano arriba, la ensancha todavía más.

Cambia a un corte con más altura arriba. Se arregla las cejas sin adelgazarlas.

Mismo pelo. Misma cara.

Pero ahora la gente le pregunta qué se hizo.

{boton:Terminar mi análisis}"""),
("Lo que más nos preguntan", """{nombre}, las dudas que casi todos tienen:

"¿Me dicen exactamente qué corte pedir?"
Sí. Los estilos que van con tu tipo de cara, para que se los enseñes a quien te corta el pelo.

"¿Y si no tengo barba o no me la quiero dejar?"
Te decimos si te conviene y, si no, qué hacer en su lugar.

"¿Quién ve mis fotos?"
Nadie más. Las borras cuando quieras.
[[cirugia]]
"¿Y si quiero saber de procedimientos?"
El plan Completo explica los que se suelen considerar para cejas, ojos o cabello, y qué preguntar antes.
[[/cirugia]]
{boton:Terminar mi análisis}"""),
("Último correo sobre esto", """{nombre}, este es el último correo que te mando sobre tu análisis.

Puedes seguir yendo al barbero a ver qué sale.

O puedes llegar sabiendo exactamente qué pedir.

Tus respuestas siguen guardadas.

{boton:Ver qué me favorece}

Aquí estaremos cuando quieras.
Resalta"""),
])

if __name__ == "__main__":
    n = 0
    for k, (t, xs) in SEC.items():
        assert len(xs) == 7, k
        for a, c in xs:
            assert "—" not in a + c, (k, a)
            assert c.count("[[") % 2 == 0, (k, a)
            n += 1
    print(n, "correos OK")
