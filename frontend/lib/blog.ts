// Blog content. Each post is server-rendered with its own SEO metadata + Article JSON-LD,
// which gives the site fresh, keyword-relevant pages that can rank for long-tail searches
// (e.g. "how to choose a saree", "cotton nighty fabric guide", "petticoat size chart").
//
// To add a new article, just append an object to POSTS. `content` is trusted HTML we author
// ourselves (no user input), rendered via dangerouslySetInnerHTML.

export interface BlogPost {
  slug: string;
  title: string;
  description: string;   // meta description (~150–160 chars)
  date: string;          // ISO date, e.g. "2026-07-07"
  readMinutes: number;
  excerpt: string;       // shown on the blog index
  content: string;       // HTML body
  /** Lead photo. Google ke Article rich result ke liye image zaroori hai -
   *  iske bina post us result ke yogya hi nahi hoti. Khali ho to site ki
   *  saanjhi tasveer lag jati hai. */
  image?: string;
}

export const POSTS: BlogPost[] = [
  {
    slug: 'how-to-choose-the-perfect-saree',
    title: 'How to Choose the Perfect Saree for Every Occasion',
    description:
      'A simple guide to choosing the right saree — fabric, colour and drape for weddings, festivals and daily wear. Tips from Mahalaxmi Fashion Hub, Balotra.',
    date: '2026-07-07',
    readMinutes: 4,
    excerpt:
      'Confused between silk, cotton and georgette? Here is a simple, practical way to pick the right saree for weddings, festivals and everyday wear.',
    content: `
      <p>A saree is timeless, but with so many fabrics, colours and drapes, choosing the right one can feel overwhelming. Here is a simple, practical approach we share with our customers every day.</p>

      <h2>1. Start with the occasion</h2>
      <p>The event decides almost everything. For <strong>weddings and big festivals</strong>, richer fabrics like silk or heavily worked georgette look grand. For <strong>daily wear and office</strong>, soft cotton and cotton-blend sarees are comfortable, breathable and easy to manage. For <strong>casual outings</strong>, lightweight prints strike the right balance.</p>

      <h2>2. Pick a fabric that suits your comfort</h2>
      <ul>
        <li><strong>Cotton:</strong> Breathable and easy to drape — perfect for hot weather and everyday use.</li>
        <li><strong>Silk:</strong> Rich, festive look with a beautiful fall — ideal for special occasions.</li>
        <li><strong>Georgette / chiffon:</strong> Flowy and flattering, great for parties and evening events.</li>
      </ul>

      <h2>3. Choose colours that flatter you</h2>
      <p>Deep reds, maroons and golds suit festive occasions and most skin tones. Pastels and soft shades feel fresh for daytime events. If you are unsure, a solid colour with a contrasting border is a safe, elegant choice.</p>

      <h2>4. Mind the drape and length</h2>
      <p>A standard saree is around 5.5 metres, with 6.3 metres if you want a matching blouse piece. Heavier fabrics hold pleats better; lighter fabrics drape softly. Always pair the saree with a well-fitted petticoat and blouse for the best look.</p>

      <h2>5. Still not sure? Ask us</h2>
      <p>At Mahalaxmi Fashion Hub, Balotra, we help you choose the right saree before you order. Just message us on WhatsApp with the occasion and your preference, and we will recommend options, confirm fabric and share real photos.</p>
    `,
  },
  {
    slug: 'how-to-wash-cotton-nighty',
    title: 'How to Wash a Cotton Nighty',
    description: 'Cotton nighty washing guide: stop shrinking and fading, handle hard water, dry safely in the monsoon, and make a nighty last for years.',
    date: '2026-09-12',
    readMinutes: 6,
    excerpt: 'Most nighties do not wear out, they get washed out. Practical advice on shrinking, fading, hard water, monsoon drying and when to finally replace one.',
    content: `
      <p>A nighty is probably the hardest working garment in your wardrobe. It sits on your body for nine or ten hours a night, it soaks up sweat, and it goes through more washes in a year than any saree or kurti you own. Most nighties do not wear out. They get washed out. Here is what actually matters, in the order it matters.</p>

      <h2>Does a cotton nighty shrink after washing?</h2>
      <p>Yes, a little. Most cotton nighties lose two to four percent in length, and nearly all of that happens in the first two or three washes. Hot water, hard rubbing and machine drying make it much worse. Cold water and line drying keep the shrinkage small enough to ignore.</p>
      <p>Shrinkage happens because cotton yarn is pulled tight during weaving, printing and finishing. The first proper wet wash lets it relax back to its natural length. This is normal behaviour for cotton and it is not a manufacturing defect.</p>
      <p>Two things follow from this. First, if you are stuck between two sizes in a pure cotton nighty, take the bigger one. Second, do not judge the fit on day one. A new cotton nighty often feels slightly stiff and slightly loose because of the starch in the finishing. Judge it after the second wash, when the cloth has settled and softened.</p>

      <h2>How should I wash a brand new nighty the first time?</h2>
      <p>Wash it alone, by hand, in plain cold water with a mild detergent, and do not soak it. The first wash is when printed and dark cotton releases loose dye, and if a maroon nighty shares a bucket with a white petticoat, the petticoat is the one that suffers.</p>
      <p>If you want to check whether a colour will run, wet a corner of the hem and press a white cloth against it. A little colour on the white cloth is normal for the first wash or two. Heavy colour means wash that piece separately for at least four or five washes.</p>
      <p>Adding a spoon of salt to the first wash is an old habit and it does no harm, though it does less than people claim. What genuinely helps is cold water, a short wash, and immediate rinsing instead of letting the nighty sit in coloured water.</p>

      <h2>Bucket, washing machine or dhobi: which is best?</h2>
      <p>A bucket is gentlest and best for dark and printed cotton. A washing machine on a gentle cycle with a low spin is perfectly fine and saves a lot of time. The dhobi is hardest on a nighty, because of hot water, strong soap and heavy beating or pressing.</p>
      <p>None of this means you must hand wash forever. It means you should match the method to the piece. Light coloured, plain, mid weight cotton nighties handle the machine well. A dark printed nighty, a rayon one, or anything with lace at the neck is better off in a bucket.</p>

      <h3>If you use a washing machine</h3>
      <ul>
        <li>Turn the nighty inside out. This protects the printed face from rubbing.</li>
        <li>Button it up and tie any belt loosely so it does not twist around other clothes.</li>
        <li>Use cold or room temperature water, and a gentle or delicate cycle.</li>
        <li>Keep the spin low, around 400 to 600, not maximum.</li>
        <li>Never wash nighties with jeans, towels, zips or velcro. That combination is the main cause of pilling, those small fuzzy balls on the surface.</li>
        <li>Do not overload. Clothes need room to move or the detergent never rinses out properly.</li>
      </ul>

      <h3>If you wash in a bucket</h3>
      <ul>
        <li>Dissolve the detergent in water first. Never rub a detergent bar or dry powder directly on the cloth.</li>
        <li>Ten to fifteen minutes in the water is enough. Overnight soaking does not clean better, it only pulls colour out.</li>
        <li>Press and squeeze. Do not twist or wring, which stretches the neck and sleeves out of shape.</li>
        <li>Rinse until the water runs clear. Leftover detergent is what makes cotton feel rough.</li>
      </ul>

      <h2>Why does my nighty fade so quickly?</h2>
      <p>Three reasons, in order of damage: drying in direct sunlight, rubbing detergent bar or powder straight onto the cloth, and long soaking. Strong afternoon sun is the biggest culprit by far and will visibly lighten a dark or printed nighty within a month of daily drying.</p>
      <p>Dry nighties inside out, in shade or indirect light, with air moving around them. A shaded balcony, a covered corridor or a room with a fan all work. If your only drying space is open terrace sun, at least turn the nighty inside out and bring it in as soon as it is dry instead of leaving it out all afternoon.</p>
      <p>Also stop hanging wet nighties on a hanger by the shoulders. The weight of the water drags the shoulder seams and neckline out of shape permanently. Fold the nighty over the line at the waist instead.</p>

      <h2>How do I dry a nighty in the monsoon without the musty smell?</h2>
      <p>The smell comes from cloth staying damp for more than six to eight hours. Spin or press out as much water as you can, hang it with space on both sides, put a fan on it, and never fold or put away a nighty that is even slightly damp at the seams.</p>
      <p>If a nighty already smells musty, washing it again with more detergent will not fix it. Rinse it in a bucket of water with half a cup of white vinegar, then rinse once more in plain water and dry it fast with a fan. The vinegar smell goes as it dries.</p>
      <p>Two more monsoon habits that help. Dry indoors near a window rather than in a closed bathroom, where the air is already saturated. And finish off a nearly dry nighty with a warm iron, which drives out the last of the moisture from thick seams and the waistband.</p>

      <h2>Does hard water spoil cotton nighties?</h2>
      <p>Yes. Hard water, which is common across much of Rajasthan, Gujarat and inland Maharashtra, leaves mineral salts inside the fibre. The cloth turns stiff and scratchy, whites go grey or yellow, and detergent lathers poorly, so people use more of it, which makes the stiffness worse.</p>
      <p>What works, in order:</p>
      <ul>
        <li>Switch to a liquid detergent, which handles hard water better than powder.</li>
        <li>Always dissolve detergent in the water before the clothes go in.</li>
        <li>Add a very small quantity of washing soda to the wash water, not to the cloth.</li>
        <li>Once every few washes, give a final rinse with half a cup of white vinegar in the bucket to soften the fibres.</li>
      </ul>
      <p>Do not combine vinegar with bleach, and do not use vinegar every single wash. And resist the instinct to double the detergent. Extra detergent in hard water mostly ends up stuck in the cloth.</p>

      <h2>Should I iron a cotton nighty?</h2>
      <p>Usually not. Shake the nighty out, smooth the seams with your hands, and line dry it flat over the line and it will look fine. Ironing is worth it only for a crisp cotton nighty you also wear around visitors, or to finish drying in the rains.</p>
      <p>If you do iron, use medium heat, work inside out, and keep the iron off printed areas, lace and embroidery. A hot iron pressed on a rubber based print will crack or lift it, and that damage cannot be reversed.</p>

      <h2>Quick fixes for the usual problems</h2>
      <table>
        <tr><th>Problem</th><th>Usual cause</th><th>What to do</th></tr>
        <tr><td>Nighty became shorter and tighter</td><td>Hot water, hard rubbing</td><td>Cold wash from now on, and take one size up next time</td></tr>
        <tr><td>Faded patches on shoulders and chest</td><td>Sun drying, detergent bar rubbed on cloth</td><td>Dry inside out in shade, switch to dissolved liquid detergent</td></tr>
        <tr><td>White nighty turned grey</td><td>Hard water and excess powder</td><td>Dissolve detergent, add a little washing soda, rinse twice</td></tr>
        <tr><td>Musty smell even after washing</td><td>Dried too slowly in humidity</td><td>Vinegar rinse, then dry fast with a fan</td></tr>
        <tr><td>Neck and armholes gone loose</td><td>Hung wet on a hanger, wrung hard</td><td>Fold over the line, press water out instead of twisting</td></tr>
        <tr><td>Fuzzy balls on the surface</td><td>Machine washed with jeans or towels</td><td>Wash nighties separately on a gentle cycle</td></tr>
      </table>

      <h2>When should I stop trying to save a nighty?</h2>
      <p>Replace it when the fabric has gone thin and translucent at the underarms or the seat, when the waist elastic no longer holds, or when sweat marks have set permanently. Thinning cloth cannot be repaired, and a nighty that has reached that stage will tear at a seam soon anyway.</p>
      <p>The single best habit is rotation. Three or four nighties in use, worn in turn, will each last far longer than two nighties washed every second day. Cotton needs a full day to dry out and recover its springiness between wears.</p>
      <p>If you are replacing one and are unsure whether to stay with your usual size after years of hot water washing, measure yourself again before ordering. You can send your measurements to Mahalaxmi Fashion Hub on WhatsApp at +91 9429429880 between 10 AM and 8 PM, Monday to Saturday, and get a straight answer about which size to take.</p>
    `,
  },
  {
    slug: 'cotton-vs-hosiery-vs-rayon-nighty',
    title: 'Cotton vs Hosiery vs Rayon Nighty',
    description: 'Cotton, hosiery or rayon nighty: how each fabric behaves in Indian heat and humidity, which lasts through frequent washing, and which to skip.',
    date: '2026-09-19',
    readMinutes: 6,
    excerpt: 'Hosiery is a knit, not a fibre. Rayon suits dry heat and fails in coastal humidity. A plain comparison of nighty fabrics, including the ones to avoid.',
    content: `
      <p>Nighty labels in India use words that sound technical and explain very little. Cotton, hosiery, rayon, sinker, malmal, cambric, crepe, satin, alpine. Some of those are fibres, some are knits, one is a weave and one is a winter finish. Once you know which is which, the choice gets simple, because only three or four of them are actually worth your money.</p>

      <h2>Which nighty fabric is best for most of the year in India?</h2>
      <p>Woven cotton for the hot months and knitted cotton hosiery for everything else. Between them those two cover nine or ten months of Indian weather at a sensible price. Rayon is a reasonable third choice in dry heat. Everything else is either decorative or meant for winter.</p>
      <p>If you only remember one thing, remember that fibre matters less than two other factors: how thin the cloth is, and how loose the cut is. A loose, thin nighty in a mediocre cotton will beat a tight, thick one in the finest cotton on a May night in Jaipur.</p>

      <h2>What is hosiery, and is it different from cotton?</h2>
      <p>Hosiery is not a fibre, it is a knit. Almost every hosiery nighty sold in India is knitted cotton, the same family of material as a good T shirt. So a hosiery nighty usually is cotton. It stretches, it needs no ironing, and it sits closer to the skin than woven cotton.</p>
      <p>You will see hosiery sold under names like sinker, single jersey and interlock. Sinker is the light one, closest to a T shirt. Interlock is thicker and double faced, which makes it warmer and less see through.</p>
      <p>The advantages are real. Hosiery stretches, so sizing is forgiving. It does not wrinkle, so it looks presentable straight off the line. It is comfortable for sleeping, housework and sitting cross legged on the floor.</p>
      <p>The honest drawbacks: cheap thin hosiery becomes see through after a few months of washing, it pills at the underarms and sides, and the neckline loses shape fast if you hang it wet on a hanger. In coastal humidity it also clings more than woven cotton does.</p>

      <h2>Is a rayon nighty a good buy or a waste of money?</h2>
      <p>Rayon is worth buying if you like a smooth, flowing feel and you live in dry heat. It is a poor choice if you sweat heavily or live in coastal humidity, because it holds moisture against your skin, goes limp and heavy, and creases the moment you sit down.</p>
      <p>Rayon, also sold as viscose, is made from wood pulp. It is not synthetic in the polyester sense, and it does feel cool against the skin in the first minutes of wear. Prints look sharper on rayon than on cotton, which is why so many bright nighties are made from it.</p>
      <p>Handle it differently from cotton. Rayon is weak when wet, so never wring it, and never scrub it. It shrinks more than cotton does, often noticeably in the first wash, so size up. And it does not tolerate a hot iron.</p>
      <p>My plain opinion: one rayon nighty in a wardrobe of five is a nice thing to have. Five rayon nighties will disappoint you by the second monsoon.</p>

      <h2>Which fabric is actually coolest in peak summer?</h2>
      <p>Thin woven cotton, and the order of those three words is the order of importance. A loose malmal or cambric cotton nighty in a light colour will beat anything else in a 44 degree afternoon, because air passes through the weave and the cloth lifts away from your skin instead of sticking.</p>
      <p>Malmal, also written mulmul, is very fine soft cotton, lovely and genuinely cool, but it is delicate and wears thin earlier than other cottons. Cambric and poplin are plain weave cottons that are a little heavier and last much longer. For most buyers, a mid weight cambric cotton is the better value and a malmal nighty is the luxury you own one of.</p>

      <h2>Which nighty fabrics should I not buy for sleeping?</h2>
      <p>Satin, net, polyester georgette and anything shiny. They photograph beautifully and are miserable to sleep in across most of India. Polyester does not absorb sweat, so on a humid night it sits wet against your skin instead of drying. Keep those for a couple of hours, not nine.</p>
      <p>A few other things to avoid in a garment you sleep in:</p>
      <ul>
        <li>Heavy embroidery, sequins or stiff lace at the neckline. It scratches, and you will feel it at 2 AM.</li>
        <li>A tightly elasticated waist with no give. Comfortable standing, uncomfortable lying down after dinner.</li>
        <li>Back zips. They press into your spine when you lie down.</li>
        <li>Fully lined yokes in summer weight nighties. The lining defeats the point of thin fabric.</li>
      </ul>
      <p>Polycotton, usually labelled PC, deserves a fairer word. It is cheap, it dries fast, and it holds colour well. It is not cool in May and it does not breathe like pure cotton. But for monsoon weeks when nothing dries, a polycotton nighty is a sensible, unglamorous workhorse, and there is no shame in owning one.</p>

      <h2>How do the fabrics compare side by side?</h2>
      <table>
        <tr><th>Fabric</th><th>What it really is</th><th>Summer</th><th>Winter</th><th>Drying</th><th>Watch out for</th></tr>
        <tr><td>Cambric or poplin cotton</td><td>Woven cotton, mid weight</td><td>Very good</td><td>Needs layering</td><td>Slow</td><td>Shrinks in first washes, creases</td></tr>
        <tr><td>Malmal or mulmul</td><td>Very fine woven cotton</td><td>Best</td><td>Too thin</td><td>Fast</td><td>Delicate, wears thin, slightly sheer</td></tr>
        <tr><td>Hosiery, sinker</td><td>Light knitted cotton</td><td>Good</td><td>Fair</td><td>Medium</td><td>Pilling, becomes sheer, neck stretches</td></tr>
        <tr><td>Hosiery, interlock</td><td>Thick knitted cotton</td><td>Warm</td><td>Good</td><td>Slow</td><td>Too warm above 35 degrees</td></tr>
        <tr><td>Rayon or viscose</td><td>Wood pulp fibre</td><td>Good in dry heat</td><td>Poor</td><td>Medium</td><td>Weak when wet, creases, shrinks</td></tr>
        <tr><td>Polycotton, PC</td><td>Cotton and polyester blend</td><td>Average</td><td>Fair</td><td>Very fast</td><td>Traps sweat, less breathable</td></tr>
        <tr><td>Satin or polyester</td><td>Synthetic woven</td><td>Poor</td><td>Poor</td><td>Fast</td><td>Does not absorb sweat at all</td></tr>
        <tr><td>Alpine or brushed fleece</td><td>Napped winter fabric</td><td>Unusable</td><td>Very good</td><td>Slow</td><td>Only worth it in a genuinely cold winter</td></tr>
      </table>

      <h2>Which fabric survives hard water and constant washing best?</h2>
      <p>Mid weight woven cotton. It takes bucket washing, machine washing and hard water with the least damage, and it gets softer rather than worse with age. Hosiery comes second but pills. Rayon is clearly the weakest, and very fine malmal thins out fastest.</p>
      <p>This is the practical reason most Indian households end up with woven cotton nighties as their everyday pieces, whatever else is in the cupboard. Cotton nighties are also the largest part of what we stock at Mahalaxmi Fashion Hub, for exactly this reason: they are what people reorder.</p>

      <h2>How do I tell what fabric I am getting when buying online?</h2>
      <p>Read the fabric line, not the photograph. A bright, drapey, shiny looking nighty in a listing is usually rayon or polyester, and a photograph cannot tell you how thin the cloth is. If the listing is vague, ask before ordering rather than after.</p>
      <p>Useful questions to ask a seller:</p>
      <ul>
        <li>Is it woven or knitted, and is it hundred percent cotton or a blend?</li>
        <li>Is it see through when held up against light?</li>
        <li>Is the print on the surface only, or does the colour go through the cloth?</li>
        <li>Does it shrink, and should I take my usual size or one bigger?</li>
      </ul>
      <p>Any seller who stocks properly can answer all four in a minute. Ours is +91 9429429880 on phone or WhatsApp, 10 AM to 8 PM, Monday to Saturday.</p>

      <h2>So what should I actually buy?</h2>
      <p>For most Indian households, a set of five covers the year: two thin woven cotton nighties for summer, two hosiery nighties for everyday wear in milder months, and one warm option if your winter is genuinely cold. Add a rayon piece only if you already know you like the feel.</p>
      <p>If you are testing a fabric for the first time, buy one piece, not three. Try it on without washing it and keep the tags on until you have decided, because a 7 day return on unused pieces protects you only while the tags are still attached.</p>
    `,
  },
  {
    slug: 'nighty-size-guide-india',
    title: 'Nighty Size Guide for India',
    description: 'Nighty size guide for India: how to measure bust, waist and hip at home, read a size chart in inches, and decide between two sizes.',
    date: '2026-09-26',
    readMinutes: 6,
    excerpt: 'Most size complaints are measuring tape problems, not sizing problems. How to take three measurements correctly, read the chart, and handle in-between sizes.',
    content: `
      <p>Most wrong size orders are not sizing mistakes. They are measuring mistakes, or guesses based on what size someone wore five years ago. Fifteen minutes with a cloth tape will save you a return, a courier trip and a week of waiting. Here is how to do it properly.</p>

      <h2>How do I measure myself for a nighty at home?</h2>
      <p>Take three measurements with a soft cloth tape over thin clothing: the fullest part of your bust, your natural waist, and the widest part of your hips. Keep the tape snug but not tight, parallel to the floor all the way round, and stand straight without pulling your stomach in.</p>
      <p>Use a tailor cloth tape, not a steel measuring tape and not a thread you measure later against a ruler. Both of those will be off by an inch or more. If you do not own a cloth tape, borrow one, because a tailor tape costs very little and is worth keeping in the cupboard.</p>
      <ul>
        <li>Stand in front of a mirror or ask someone to help. It is almost impossible to keep the tape level behind your back on your own.</li>
        <li>Wear a normal bra and thin clothing. Do not measure over a saree, a petticoat or a loose kurti.</li>
        <li>Breathe normally. Do not hold your breath and do not suck in.</li>
        <li>Write all three numbers down in inches. Most Indian size charts for nighties are in inches, not centimetres.</li>
        <li>Measure twice. If the two readings differ by more than half an inch, measure a third time.</li>
      </ul>

      <h2>Where exactly are the bust, waist and hip?</h2>
      <p>Bust is the fullest part of your chest, with the tape going straight round under your arms. Waist is the narrowest part of your torso, roughly an inch above the navel, where your body bends sideways. Hip is the widest part of your seat, about eight inches below the waist.</p>
      <p>Two common errors here. People measure the waist where their saree or leggings sit, which is usually lower and wider than the natural waist. And people measure the hip at the hip bone instead of at the widest point, which is lower. Both mistakes push you towards a size that is too small.</p>

      <h2>What is the nighty size chart in inches?</h2>
      <p>Readymade nighty sizes run from S to XXL, measured in inches across bust, waist and hip. Find the row your largest measurement falls into. That is your size. Here is the chart we use at Mahalaxmi Fashion Hub, and it matches most standard Indian readymade sizing.</p>
      <table>
        <tr><th>Size</th><th>Bust (inches)</th><th>Waist (inches)</th><th>Hip (inches)</th></tr>
        <tr><td>S</td><td>32 to 34</td><td>26 to 28</td><td>35 to 37</td></tr>
        <tr><td>M</td><td>34 to 36</td><td>28 to 30</td><td>37 to 39</td></tr>
        <tr><td>L</td><td>36 to 38</td><td>30 to 32</td><td>39 to 41</td></tr>
        <tr><td>XL</td><td>38 to 40</td><td>32 to 34</td><td>41 to 43</td></tr>
        <tr><td>XXL</td><td>40 to 42</td><td>34 to 36</td><td>43 to 45</td></tr>
      </table>
      <p>Notice that the ranges overlap at the edges. A 36 inch bust appears in both M and L. That overlap is deliberate, and it is where the next question comes in.</p>

      <h2>Which size should I take if I fall between two sizes?</h2>
      <p>Take the larger one. A nighty is sleepwear. It is supposed to be loose enough to sit cross legged, bend, cook and sleep in. A nighty that fits like a kurti will feel tight across the chest within an hour and will pull at the armholes when you raise your arms.</p>
      <p>The one exception is knitted hosiery, which stretches. If a hosiery nighty is slightly loose it will still look fine, so the risk of sizing up is small there too. In woven cotton, sizing up is almost always the right call because woven cotton has no stretch and also shrinks slightly in the first washes.</p>

      <h2>What if my bust is one size and my hips are another?</h2>
      <p>Go by whichever measurement is larger, and ignore the smaller one. A nighty is cut loose and fairly straight, so extra room at the waist or hip is not a problem. Being an inch short at the bust or hip is a problem, because that is where the cloth pulls and the seams strain.</p>
      <p>In practice, most people find their bust and hip land within one size of each other. If yours are two sizes apart, say an M bust and an XL hip, pick the larger size and look for a nighty with a straight or A line cut rather than a fitted waist with a belt.</p>

      <h2>Does the fabric change which size I should take?</h2>
      <p>Yes, and this is the detail most buyers miss. Pure woven cotton shrinks slightly, so take your chart size or one up. Knitted hosiery stretches, so your chart size is right. Rayon shrinks more than cotton and has little stretch, so take one size up.</p>
      <p>Thickness matters too. A heavy winter nighty worn over a thermal or leggings needs more room than a thin summer one. If you intend to layer in winter, size up.</p>

      <h2>What does Free Size actually fit?</h2>
      <p>Free Size nighties are cut loose and generally sit somewhere between M and L, which means a bust of roughly 34 to 38 inches. They work well if you are in that band and want an easy fit. If you are XL or XXL, a Free Size piece is a gamble that usually does not pay off.</p>
      <p>Free Size also tells you nothing about length, and length is where tall and short buyers get caught. If the listing does not state the length, ask for it before ordering a Free Size piece.</p>

      <h2>How do I choose the right length?</h2>
      <p>Measure from the top of your shoulder, beside the neck, straight down to where you want the hem to fall. Compare that number to the length stated in the listing. Full length nighties generally run between 50 and 56 inches, which suits most heights but not everyone.</p>
      <p>If you are around five feet or shorter, a 55 inch nighty will drag on the floor and the hem will fray and pick up dust. If you are 5 feet 7 or taller, a 50 inch nighty will sit uncomfortably high. Length is easy to shorten at a tailor and impossible to add, so when in doubt go longer.</p>

      <h2>Is nighty sizing the same as blouse or kurti sizing?</h2>
      <p>No, and you should not assume it is. Blouse sizes are fitted to the body with darts and are often stitched to your own measurements. Kurti sizes are cut closer than nighties. The M you wear in a kurti can easily be an L in a nighty, or the other way round.</p>
      <p>Similarly, do not carry over a size from a foreign brand. Indian readymade sizing is its own system. Always go back to your three inch measurements and read the chart on the page you are buying from.</p>

      <h2>What if the size is still wrong when it arrives?</h2>
      <p>You have 7 days from delivery to return it for any reason, including size and a simple change of mind. The condition is that the piece must be unused, unwashed and with tags intact. So try it on over your own clothes, keep the tags on, and do not wash it before you have decided.</p>
      <p>Who pays the return postage depends on why it is going back. If we sent the wrong size or a damaged or defective piece, we reimburse your return postage up to Rs. 100, and we ask for a video of the parcel being opened, reported within 48 hours of delivery. If you simply changed your mind or measured wrong, the return postage is yours to pay.</p>
      <p>One important exception: innerwear cannot be returned once the packet is opened, for hygiene reasons. Measure carefully before ordering innerwear, because there is no second chance on that category.</p>

      <h2>Common measuring mistakes to avoid</h2>
      <ul>
        <li>Pulling the tape tight to get a smaller number. The nighty will not stretch to match your optimism.</li>
        <li>Measuring over thick clothing, which adds one to two inches everywhere.</li>
        <li>Letting the tape slope down at the back, which adds length to every reading.</li>
        <li>Using the waist of your jeans as your waist size. Garment waist labels and body measurements are different things.</li>
        <li>Guessing from the last nighty you bought, which may itself have shrunk by an inch.</li>
      </ul>
      <p>If your measurements sit awkwardly between two rows, send all three numbers and your height on WhatsApp to +91 9429429880 between 10 AM and 8 PM, Monday to Saturday, and ask. A straight answer before you order is cheaper for everyone than a return after.</p>
    `,
  },
  {
    slug: 'best-nighty-for-indian-summer',
    title: 'Best Nighty for Indian Summer',
    description: 'Best nighty for Indian summer and winter: which fabric, sleeve length and cut suit dry heat, coastal humidity, monsoon damp and a cold north winter.',
    date: '2026-10-02',
    readMinutes: 6,
    excerpt: 'What to wear to bed through a 44 degree May, a sticky monsoon and a Delhi January, including the summer nighties that are not worth buying at all.',
    content: `
      <p>India does not have one climate, so there is no single right nighty. A piece that is perfect in Jaipur in May is useless in Shimla in January, and an alpine nighty bought for a Chennai winter is money thrown away. Here is how to choose by season and by where you actually live.</p>

      <h2>What is the best nighty for Indian summer?</h2>
      <p>A loose, thin, light coloured hundred percent cotton nighty with short or sleeveless arms, no lining and minimal embroidery. The looseness matters as much as the fabric, because what cools you is air moving between the cloth and your skin, not the cloth itself.</p>
      <p>In fabric terms that means a fine woven cotton: malmal for the lightest feel, cambric or poplin for better durability. Avoid anything with a lining at the yoke, because the lining cancels out the thinness you paid for.</p>
      <p>A sensible summer buy, in order of priority: pure cotton, thin, loose, light colour, simple neck, short sleeves. Get those six right and brand or print hardly matters.</p>

      <h2>Why does my cotton nighty still feel sticky in summer?</h2>
      <p>Usually one of three reasons: it is a polycotton blend rather than pure cotton, it is cut too close to the body, or the air around you is so humid that sweat cannot evaporate at all. In coastal humidity, no fabric will feel dry. The best you can do is loose and thin.</p>
      <p>Dry heat and wet heat are different problems. In Rajasthan or inland Madhya Pradesh in May, sweat evaporates and thin cotton genuinely cools you. In Mumbai, Chennai, Kochi or Kolkata in June, sweat does not evaporate, so a clinging knit feels horrible and a loose woven nighty with open armholes is the only real improvement.</p>
      <p>A practical point for humid cities: cut matters more than fabric. A sleeveless or short sleeved woven cotton nighty that hangs away from the body will beat an expensive clinging piece every time.</p>

      <h2>What cut and length work best in heat?</h2>
      <p>Short sleeves or sleeveless, a wide round or V neck without a stiff collar, a straight or A line body with no belt, and either full length or knee length depending on your household. The enemies are cuffs, tight armholes, high closed necks and elastic that grips.</p>
      <ul>
        <li>Sleeveless is coolest, short sleeves are more practical if you answer the door in your nighty.</li>
        <li>A front opening with buttons lets you open the neck when it gets hot at night.</li>
        <li>Skip a fitted waist. Loose through the middle is cooler and far more comfortable lying down.</li>
        <li>Full length protects your legs from mosquitoes, which is worth more than a knee length piece saves you in heat.</li>
      </ul>

      <h2>Which summer nighties are not worth buying?</h2>
      <p>Polyester satin, net, shiny georgette, dark heavy prints, anything with a lined yoke, and nighties with heavy lace or sequins at the neck. Synthetics do not absorb sweat, so instead of drying they hold moisture against your skin all night. They look better than they feel.</p>
      <p>Two more honest warnings. Very thin malmal nighties in pale colours can become close to see through after a few months of washing, which some buyers mind and some do not. And a tightly elasticated waistband that feels fine standing in the shop will dig in when you lie down after dinner.</p>
      <p>If your budget is tight, a plain cotton nighty with no embroidery is a better summer buy than a fancier synthetic one at the same price. For sleeping in Indian heat, plain cotton wins against decorated polyester every single time.</p>

      <h2>What should I wear in the monsoon?</h2>
      <p>Something a little lighter, and above all something that dries fast. Monsoon is the one season when a polycotton blend earns its place, because pure cotton can take a day and a half to dry in saturated air and a damp nighty starts smelling musty within hours.</p>
      <p>You do not have to abandon cotton. Just keep two thinner pieces in rotation, spin or press the water out properly, and dry indoors with a fan rather than in a closed bathroom. Finish off thick seams and waistbands with a warm iron if they are still damp.</p>
      <p>Be honest with yourself about your drying space. If you live in a flat with a covered balcony and no dryer, owning one fast drying polycotton nighty for the worst fortnight of the rains is practical, not a compromise of taste.</p>

      <h2>What is the best nighty for winter in India?</h2>
      <p>It depends entirely on where you live. North of roughly Nagpur, a brushed alpine or thick interlock hosiery full sleeve nighty makes real sense for six to eight weeks. In coastal and southern India, an ordinary cotton nighty with a shawl over it is enough, and a woollen nighty is wasted money.</p>
      <p>For a genuinely cold north Indian winter, the features that matter are full sleeves without loose cuffs, full length, a closed or high neck, and a thicker napped fabric that holds a layer of warm air. Alpine, flannel and thick interlock all do this.</p>
      <p>For Bengaluru, Hyderabad, Chennai, Kochi or Mumbai, winter means a few cool weeks. A normal mid weight cotton nighty with full sleeves, plus a shawl on the coldest nights, covers it completely.</p>

      <h2>Should I buy a warm nighty or just layer up?</h2>
      <p>Layering wins for most people. A cotton nighty with leggings or a thermal underneath and a shawl on top handles a much wider temperature range than a single thick nighty, washes more easily, and costs less. Buy a dedicated warm nighty only if your winter is genuinely cold for weeks together.</p>
      <p>The problem with a thick nighty is that you cannot adjust it. A January night that starts at 9 degrees and sits under a quilt by midnight will leave you too warm, and there is nothing to remove. Layers let you add and subtract. They also let you use the same cotton nighties you already own for ten months of the year.</p>

      <h2>Which nighty for which season and region?</h2>
      <table>
        <tr><th>When and where</th><th>Fabric</th><th>Sleeves and length</th><th>Skip</th></tr>
        <tr><td>Peak summer, dry heat, north and west</td><td>Thin woven cotton, malmal or cambric</td><td>Sleeveless or short, full length</td><td>Synthetics, lined yokes, dark heavy prints</td></tr>
        <tr><td>Peak summer, coastal humidity</td><td>Loose thin woven cotton</td><td>Sleeveless, loose armholes</td><td>Clinging hosiery, satin, rayon</td></tr>
        <tr><td>Monsoon</td><td>Thin cotton or polycotton for fast drying</td><td>Short sleeves, full length</td><td>Thick cotton that will not dry</td></tr>
        <tr><td>Mild winter, south and coastal</td><td>Mid weight cotton or hosiery</td><td>Full sleeves, full length, plus a shawl</td><td>Alpine or woollen nighties</td></tr>
        <tr><td>Cold winter, north and hills</td><td>Alpine, flannel or thick interlock</td><td>Full sleeves, high neck, full length</td><td>Thin cotton worn alone</td></tr>
        <tr><td>Sleeping in air conditioning</td><td>Mid weight cotton</td><td>Full sleeves, full length</td><td>Sleeveless thin cotton</td></tr>
      </table>

      <h2>Does the colour of a summer nighty matter?</h2>
      <p>Less than people assume, for indoor wear at night. Light colours reflect heat outdoors, but indoors after sunset the difference is small. Where colour genuinely matters is fading and stains: dark colours fade visibly with sun drying, while pale colours show sweat and oil marks at the neck.</p>
      <p>The practical choice is mid tone prints for everyday summer wear. They hide marks better than plain white and fade less obviously than solid navy or maroon. If you do buy dark cotton, dry it inside out and in shade.</p>

      <h2>What about sleeping in air conditioning?</h2>
      <p>Air conditioning reverses the usual summer advice. In a room at 24 degrees with air blowing on you for seven hours, a sleeveless thin nighty will leave your shoulders and arms cold by 3 AM. A mid weight cotton nighty with full sleeves and full length is the better choice.</p>
      <p>If you share a room and the AC setting is not yours to decide, keep a light cotton shawl or dupatta at the foot of the bed. It is cheaper than owning a separate set of nighties for air conditioned nights.</p>

      <h2>How many nighties do I need for the whole year?</h2>
      <p>Four to six is enough for most people. Two or three thin cotton for the hot months, two mid weight cotton or hosiery for the rest of the year, and one warm piece if your winter needs it. Rotation matters more than quantity, because cotton lasts longer when it gets a day to recover.</p>
      <p>If you are stocking up for a season, order them together rather than one at a time. Shipping is free above Rs. 999 and a flat Rs. 60 below that, dispatch is in 1 to 2 business days by Delhivery, and most orders reach customers 4 to 10 business days after being placed. Cash on Delivery is available everywhere in India, along with UPI, cards and net banking.</p>
      <p>Unsure which weight suits your city? Call or WhatsApp +91 9429429880 between 10 AM and 8 PM, Monday to Saturday, tell us where you live and what you found too hot or too cold last year, and we will tell you plainly what to pick.</p>
    `,
  },
  {
    slug: 'how-to-wash-a-cotton-saree',
    title: 'How to Wash a Cotton Saree',
    description: 'How to wash a cotton saree by hand or machine, dry it without fading, and fold and store it so it stays good for years.',
    date: '2026-09-14',
    readMinutes: 6,
    excerpt: 'A cotton saree can last years or one bad wash. Here is how to wash, dry, iron, fold and store yours properly, including what to skip.',
    content: `
      <p>A cotton saree is the most forgiving thing in your almirah and also the easiest to ruin. Most cotton sarees do not die of old age. They die of one hot machine wash, one afternoon on the terrace in full sun, or six months folded inside a plastic cover through a monsoon.</p>

      <h2>Should you wash a new cotton saree before wearing it?</h2>
      <p>Yes. Soak a new cotton saree on its own in cold water with two spoons of salt for about twenty minutes, then rinse it well. Excess dye left over from printing comes out then, instead of coming out later on your blouse.</p>
      <p>Dark and hand printed cottons bleed the most: indigo, maroon, black, bandhani, ajrakh and kalamkari. Balotra, where our shop is, is a cotton printing and dyeing town, and locally printed cotton almost always releases some colour in the first two or three washes. Be honest with yourself about what salt does, though. It only removes loose dye, it does not lock the colour in permanently. Keep washing dark cottons separately for the first three or four washes, and never soak a dark saree next to a white petticoat.</p>

      <h2>How do you wash a cotton saree by hand?</h2>
      <p>Dissolve a mild detergent in a bucket of cold or lukewarm water first, put the saree in for five to ten minutes, press and squeeze it gently along its length, then rinse twice in clean water. Do not twist, wring or brush it.</p>
      <ul>
        <li>Never pour detergent powder or liquid straight on to the fabric. Undiluted detergent sitting on one spot is how cottons get pale patches.</li>
        <li>Soaking longer does not clean better. Past fifteen minutes the dye starts loosening and the dirt you lifted settles back into the weave.</li>
        <li>Work on the three places that actually get dirty: the underarm area, the top edge of the pallu where it touches your neck, and the waist where the tucked pleats rub the petticoat string.</li>
        <li>Rub those spots between your fingers, never with a brush and never on a washing stone. A brush breaks the surface fibres and the print goes dull in that patch for good.</li>
      </ul>

      <h2>Can you wash a cotton saree in a washing machine?</h2>
      <p>A plain mill made cotton saree can go into a fully automatic machine on the gentle cycle, in cold water, inside a mesh bag, with the spin set to the lowest speed. Hand printed, dark and starched sarees should not.</p>
      <p>If you do use a machine, fold the saree loosely lengthwise before putting it in the mesh bag, so six yards of fabric does not wrap itself into a rope around the agitator. In a semi automatic machine, wash the saree by hand in the tub and use the dryer basket for thirty seconds only, just to throw off water. The trade off is real: machine washing saves you twenty minutes each time and costs the saree a season or two of life. Soft mulmul, malmal and voile sarees fray at the border edge in a machine faster than anything else.</p>

      <h2>What should you never use on a cotton saree?</h2>
      <p>Bleach, chlorine, hot water, hard brushes, and detergents with optical brighteners on coloured cotton. Anything that whitens by chemistry rather than by cleaning leaves a cotton saree looking washed out along the folds long before the fabric itself wears out.</p>
      <ul>
        <li><strong>Bleach and whitening powders:</strong> acceptable on plain white cotton once in a while, never on coloured or printed cotton.</li>
        <li><strong>Hot water:</strong> cotton shrinks with heat. The saree will not look shorter, but the weave tightens and the fall turns stiff and boardy.</li>
        <li><strong>Fabric conditioner:</strong> not worth buying for cotton. It coats the fibre, cuts the absorbency that makes cotton comfortable in heat, and leaves the saree limp instead of crisp.</li>
        <li><strong>Neat stain remover on prints:</strong> test it on the inside of the pallu edge first. Many printed cottons lose the print faster than they lose the stain.</li>
      </ul>

      <h2>How do you dry a cotton saree without fading it?</h2>
      <p>Dry it in shade with air moving across it, never in direct afternoon sun. Strong sun fades cotton dye visibly within a single summer, and it turns white cotton yellow along the crease line where the fabric hangs over the wire.</p>
      <p>Spread the saree over two parallel lines or over the back of a cot so the weight is shared. Hanging six yards from one clip at the pallu stretches the border out of shape, and a stretched border never recovers. Shift the saree along the line once while it is drying so the fold does not set into a permanent crease.</p>
      <p>In the monsoon, dry it indoors under a fan rather than on a damp terrace. A cotton saree packed away even slightly damp develops a musty smell and black mildew spots that no wash removes. Smell the folds before you put it away. If there is any smell at all, it is not dry.</p>

      <h2>Does hard water spoil cotton sarees?</h2>
      <p>Hard water does not rot cotton, but the calcium in it leaves deposits that make the fabric stiff, dull and slightly grey over the years. The bigger problem is indirect: detergent will not lather, so people add more detergent, and that is what does the damage.</p>
      <ul>
        <li>Use a liquid detergent instead of powder. It dissolves and rinses out far better in hard water.</li>
        <li>Add a spoon of washing soda to the bucket before the detergent, then use less detergent, not more.</li>
        <li>Give a final rinse with a spoon of white vinegar in the water. It strips the soap film and softens the fabric, and the smell goes as it dries.</li>
      </ul>

      <h2>Should you starch a cotton saree?</h2>
      <p>Starch only when you want a crisp fall for an occasion. For a saree you wear to work or at home, skip it. Heavy starch cracks the fibre at every fold, attracts silverfish in storage, and has to be washed out again anyway.</p>
      <p>If you do starch, the old method is still the best. Keep the strained water from boiled rice, dilute it until it is just cloudy, dip the washed saree, squeeze lightly and dry in shade. Readymade liquid stiffeners work too and are easier to control. Either way, wash the starch out before storing the saree for a long stretch. Starched cotton that sits folded for a year comes out with white cracked lines along every fold.</p>

      <h2>How should you iron, fold and store a cotton saree?</h2>
      <p>Iron cotton while it is still slightly damp, on medium to high heat, from the reverse side. Then fold it in three or four broad folds, wrap it in an old cotton cloth, and keep it out of plastic covers so the fabric can breathe.</p>
      <p>Lay a thin cotton cloth over printed or dark portions instead of running the iron over the print directly. Broad loose folds are kinder than tight small ones, because every fold line is a line of stress. Change where the folds fall each time you put the saree away, and refold your stored sarees every two or three months.</p>
      <p>For long storage, line the almirah shelf with paper or cloth so the metal does not leave rust marks. Keep dried neem leaves or a few cloves in a small muslin pouch between the piles, and keep naphthalene balls off the fabric itself, since they stain and the smell lingers for months. Do not put your heaviest sarees at the bottom of a tall stack. Shake everything out and refold twice a year, ideally at the start and the end of the monsoon.</p>

      <h2>Is a cotton saree worth giving to the dhobi or dry cleaner?</h2>
      <p>Usually not. Plain cotton needs no dry cleaning, and the money is better saved. Dhobi washing cleans well but uses heavy beating and strong soap, which is why dhobi washed cottons soften and thin out quickly along the borders.</p>
      <p>Send a cotton saree out only for an oil or grease stain you cannot shift at home, and say what the stain is. One more thing worth knowing before you wash anything new: once a saree has been washed, no shop can take it back. If a saree reaches you damaged, defective or simply not what was ordered, report it within 48 hours of delivery with a video of the parcel being opened, and the return is handled as the shop mistake rather than yours.</p>
    `,
  },
  {
    slug: 'saree-petticoat-guide',
    title: 'Choosing the Right Petticoat',
    description: 'Saree petticoat guide: how to pick the right length, waist size, fabric and colour, and why the wrong petticoat ruins your saree drape.',
    date: '2026-09-22',
    readMinutes: 6,
    excerpt: 'The petticoat decides how a saree falls. Length, waist size, fabric and colour explained, with the mistakes that make pleats sag, drag or show through.',
    content: `
      <p>Nobody sees your petticoat, and it still decides how your saree looks. The saree only hangs on it. Get the length, the waist and the fabric right and an ordinary cotton saree falls beautifully. Get them wrong and even an expensive saree sags, slips and shows a line at the waist.</p>

      <h2>How long should a petticoat be?</h2>
      <p>It should end about half an inch above the floor when you are wearing the footwear you will wear with the saree. Not brushing the floor, not showing ankle. Measure from the point where you actually tie it, which for most women is two to three inches below the navel.</p>
      <p>Readymade petticoats mostly come in 38, 40 and 42 inch lengths. As a starting point:</p>
      <table>
        <tr><th>Your height</th><th>Usual petticoat length</th></tr>
        <tr><td>Up to 5 ft</td><td>36 to 38 inches</td></tr>
        <tr><td>5 ft to 5 ft 3 in</td><td>38 to 40 inches</td></tr>
        <tr><td>5 ft 3 in to 5 ft 6 in</td><td>40 inches</td></tr>
        <tr><td>5 ft 6 in and above</td><td>42 inches</td></tr>
      </table>
      <p>Add your heel height if you wear heels with sarees. Cotton petticoats also shrink roughly an inch in length over the first two washes, so when you are between two lengths, take the longer one and get it hemmed after the first wash rather than before. Keep one petticoat hemmed for heels and one for flats. That single difference causes more last minute trouble than colour matching ever does.</p>

      <h2>How do you choose the right petticoat waist size?</h2>
      <p>Go by your waist measurement in inches, taken where you will tie the saree, and then take the next size up if the petticoat is cotton. Cotton shrinks at the waist as well as the length, and a tight petticoat waist shows as a roll under a thin saree.</p>
      <table>
        <tr><th>Size</th><th>Bust (in)</th><th>Waist (in)</th><th>Hip (in)</th></tr>
        <tr><td>S</td><td>32 to 34</td><td>26 to 28</td><td>35 to 37</td></tr>
        <tr><td>M</td><td>34 to 36</td><td>28 to 30</td><td>37 to 39</td></tr>
        <tr><td>L</td><td>36 to 38</td><td>30 to 32</td><td>39 to 41</td></tr>
        <tr><td>XL</td><td>38 to 40</td><td>32 to 34</td><td>41 to 43</td></tr>
        <tr><td>XXL</td><td>40 to 42</td><td>34 to 36</td><td>43 to 45</td></tr>
      </table>
      <p>On the closure, a drawstring (nada) is better than full elastic, because what holds a saree up is a waistband you can pull tight. Full elastic is comfortable and sags under the weight of tucked pleats by evening. The best arrangement is elastic at the back with a drawstring at the front. When you tie the knot, keep it flat and slightly to one side, and tuck the loose ends down, or the knot shows as a lump right at the navel.</p>

      <h2>Which petticoat fabric goes with which saree?</h2>
      <p>Match grip to grip and slip to slip. Use cotton petticoats under cotton and handloom sarees, where you want the pleats to stay where you tuck them. Use satin or smooth polyester under georgette, chiffon and silk, where you want the saree to fall and not cling.</p>
      <table>
        <tr><th>Saree</th><th>Petticoat fabric</th><th>Why</th></tr>
        <tr><td>Cotton, khadi, handloom</td><td>Cotton or cotton mulmul</td><td>Pleats hold, and cotton breathes in heat</td></tr>
        <tr><td>Silk and art silk</td><td>Cotton satin</td><td>Saree slides over it and the pleats fall straight</td></tr>
        <tr><td>Georgette and chiffon</td><td>Satin or shapewear</td><td>No clinging and no static</td></tr>
        <tr><td>Light or pastel cotton</td><td>Cotton in a skin shade</td><td>Nothing shows through</td></tr>
        <tr><td>Heavy zari or wedding saree</td><td>Firm cotton satin with a drawstring</td><td>Takes the weight without sliding down</td></tr>
      </table>
      <p>Two honest warnings. A shiny nylon petticoat under a thin cotton saree is the worst possible combination: it traps sweat, creates static, and the shine shows through. And do not buy a pure silk petticoat. It costs several times what cotton satin costs and does nothing cotton satin cannot do.</p>

      <h2>What colour petticoat should you buy?</h2>
      <p>Match the petticoat to the base colour of the saree, not to the blouse. If you are buying only one or two, buy a skin shade and a black. Those two sit invisibly under almost everything you own.</p>
      <p>The common belief that white goes under everything is simply wrong. Under a pastel or light printed cotton, white reads as a brighter patch and makes the saree own colour look washed out, while a beige or skin shade disappears. Under a dark saree, white glows through at the pleat edges, especially in photographs taken with flash. Keep white for white and off white sarees only. For a very bright saree in rani pink or parrot green, a petticoat in a close shade matters, because the pleat edges flash the petticoat colour as you walk.</p>

      <h2>Why does the wrong petticoat ruin the drape?</h2>
      <p>Because the petticoat is the structure and the saree is only cloth hanging on it. A loose waist means everything slips through the evening, a tight waist gives you a roll, and the wrong length means the pleats either drag on the floor or hang short and show your ankle.</p>
      <ul>
        <li><strong>Too long:</strong> the pleats catch under your heel, the hem frays within a few wears, and you walk in short careful steps all evening.</li>
        <li><strong>Too short:</strong> a gap at the ankle that no amount of adjusting at the waist will fix.</li>
        <li><strong>Loose waist:</strong> the weight of the tucked pleats drags the whole drape down over a few hours.</li>
        <li><strong>Thick stitched waistband:</strong> a visible horizontal line under thin cotton and georgette.</li>
        <li><strong>Too much flare:</strong> extra fabric bunches at the tuck and the pleats lose their edge.</li>
        <li><strong>Too straight and narrow:</strong> you cannot take a normal stride, and the front pleats pull open on stairs.</li>
      </ul>
      <p>A plain A line petticoat with moderate flare, six or eight panels, suits nearly every saree and nearly every body type. That is the one to buy if you are buying blind.</p>

      <h2>How many petticoats do you actually need?</h2>
      <p>Three is enough for most people: one in a skin shade, one in black, and one in the colour you wear most. Add a firmer one if you own heavy silk sarees. Buying a petticoat to match every saree colour is a waste of money.</p>
      <p>Skip fishtail and mermaid petticoats unless you are wearing a soft saree to a function and will not be walking much or sitting on the floor. In daily use they restrict your stride and ride up the moment you sit cross legged. Readymade petticoats at our shop come in S to XXL with some pieces in Free Size, and if you are between two sizes or unsure about length, send your height and waist measurement on WhatsApp to +91 9429429880 any day from Monday to Saturday, 10 AM to 8 PM, before you order.</p>

      <h2>Can you wear shapewear instead of a petticoat?</h2>
      <p>Yes with georgette, chiffon and net sarees, where a smooth line is the whole point. No with stiff cotton and handloom sarees, because shapewear is slippery, the tucked pleats have nothing to grip, and the saree works loose as you move.</p>
      <p>Shapewear is also hot for an Indian summer day, more trouble when you need a bathroom, and the decent ones cost noticeably more than a cotton petticoat. For a wedding evening in air conditioning it earns its price. For a working day in May it does not.</p>

      <h2>How do you wash and look after petticoats?</h2>
      <p>Wash a new dark petticoat alone, by hand, the first two times. Dark cotton petticoats release a lot of dye, and that dye goes straight into whichever saree you tuck over it. After those first washes, a gentle machine wash is fine.</p>
      <p>Check two things every few months. The drawstring channel at the waist is what tears first, and the hem is what wears from scuffing the floor. Both are a five minute job for any tailor and far cheaper than a new petticoat. Replace a petticoat when the waist channel has given way in two places or the hem has gone thin, not because the colour has faded. Under a saree, a faded petticoat looks exactly like a new one.</p>
    `,
  },
  {
    slug: 'saree-draping-for-beginners',
    title: 'Saree Draping for Beginners',
    description: 'Saree draping for beginners: a step by step guide to pleats, pallu length, pinning and the mistakes that make a first saree slip.',
    date: '2026-09-29',
    readMinutes: 6,
    excerpt: 'Draping your first saree, from tucking and pleating to pallu length and pinning, plus the beginner mistakes that make a saree slip through the evening.',
    content: `
      <p>Draping a saree is not difficult, it is just unfamiliar. Nearly every problem a first timer has comes from three things: a loosely tied petticoat, an uneven lower edge, and trying to do it ten minutes before leaving the house. Give yourself half an hour the first time and the drape will hold all evening.</p>

      <h2>What do you need before you start draping?</h2>
      <p>A petticoat you can tie tight, a well fitted blouse, the footwear you will actually wear, five or six safety pins, and a mirror in which you can see the floor. Put the footwear on before you begin, not after, or the whole length will be wrong.</p>
      <p>An ironed saree is far easier to handle than a crushed one. A brand new, heavily starched cotton saree is the hardest thing to drape, so wash it once before you attempt a careful drape with it. A mirror that shows you the hem matters much more than one that shows you your face.</p>

      <h2>How do you drape a saree step by step?</h2>
      <p>Tuck the plain end into the petticoat at the right of your navel, take one full turn around your waist, set the pallu length over your left shoulder, then make five to seven pleats in the front, tuck them in and pin them. Adjust, then stop.</p>
      <ol>
        <li>Hold the plain end, the end without the heavy pallu, in your right hand. Tuck about six inches of it into the petticoat slightly to the right of your navel, with the inside of the saree facing you.</li>
        <li>Take the saree once around your waist from right to left and back to the front, tucking it into the petticoat waistband as you go. Keep the lower edge just off the floor all the way around, including at the back. Check this now. Everything after it depends on it.</li>
        <li>Bring the remaining fabric up across your body and take the pallu over your left shoulder. Set its length so it falls to about the back of your knee and let it hang there. This is the pallu length you will finish with, so fix it before you pleat.</li>
        <li>Take the fabric between your tuck point and your left shoulder and gather the pleats. Hold the top with your left hand and make pleats of about five inches each, laying one over the other, all facing to your left.</li>
        <li>Hold the top of the pleat bunch, straighten the bottom edges so every pleat ends at the same height, and tuck the bunch into the petticoat just left of the navel. Pin the top of the pleats to the petticoat.</li>
        <li>Smooth the pallu across your shoulder. If you want a narrow pallu, pleat it into four or five folds and pin it at the shoulder through the blouse.</li>
        <li>Walk a few steps, sit down once and stand up, then check the mirror and re-tuck whatever has loosened. Then leave it alone.</li>
      </ol>
      <p>This is the Nivi drape, the one used across most of India. The Gujarati and Rajasthani styles take the pallu over the right shoulder and across the front instead, and the pleating is done the same way.</p>

      <h2>How many pleats should a saree have, and how wide?</h2>
      <p>Five to seven pleats of roughly five inches each suits most sarees and most body types. Use fewer, broader pleats for a heavy silk, and more, narrower pleats for a light cotton or georgette, which needs the extra folds to hold its shape.</p>
      <p>Every pleat must face the same direction, to your left, so the saree closes neatly as you walk instead of opening up. Keep the lower edges level: one pleat hanging lower than the others is the single thing that makes a drape look unpractised. If you are on the shorter side, narrower pleats and a narrow pleated pallu lengthen the line. If you are tall, you can carry a broad open pallu comfortably.</p>

      <h2>How long should the pallu be?</h2>
      <p>For everyday wear, the pallu should end around the back of your knee. For a function, where you want the pallu work on show, anything from mid calf to just above the ankle looks good, as long as it does not touch the floor when you sit down.</p>
      <p>Set this length before you make the pleats. If you try to correct pallu length at the end, you pull the front pleats out of place and have to redo them. A pallu that is too short makes the waist look broader. One that is too long means you spend the whole evening holding it off the floor.</p>

      <h2>What are the most common beginner mistakes?</h2>
      <p>Almost all of them happen before the pleats are made. The usual list is a loose petticoat, bare feet during draping, an uneven hem at the back, and too many safety pins compensating for all three.</p>
      <ul>
        <li>Draping barefoot and then putting on heels. The saree is now two inches short everywhere.</li>
        <li>Tying the petticoat at a comfortable tightness. Tie it tighter than feels normal, because the saree weight will pull it down.</li>
        <li>Tucking the saree into the petticoat drawstring instead of into the waistband itself. The string cuts in and the tucks slide out.</li>
        <li>Levelling the lower edge only at the front. Turn and check the back hem in the mirror before you pleat.</li>
        <li>Pleats of uneven width. They look fine while you stand still and open up the moment you walk.</li>
        <li>Using fifteen pins. Four or five well placed pins hold better, and every pin is a hole in the fabric.</li>
        <li>Pinning through the saree alone. A pin must catch the petticoat or the blouse to do any work.</li>
      </ul>

      <h2>How do you keep a saree from slipping all day?</h2>
      <p>A saree stays up because of the petticoat waist and three pins, not because of hard tucking. Tie the petticoat firmly, pin the top of the pleat bunch to the petticoat, pin the pallu at the shoulder, and pin the first tuck at the right of the navel.</p>
      <p>A saree belt or waist clip genuinely helps for a long day with a cotton saree, but it adds bulk at the waist under thin fabric, so it is a trade off rather than a free fix. Double sided fabric tape sold for the shoulder is not worth buying for cotton: it loses grip with sweat within an hour. For a full day out, plan to re-tuck once in the afternoon instead of expecting the morning drape to last twelve hours.</p>

      <h2>Which saree is easiest to drape the first time?</h2>
      <p>A medium weight cotton or soft cotton blend saree of about 5.5 metres. It has enough grip to stay where you tuck it and enough weight to hang straight, without the slipperiness of chiffon or the sheer bulk of a heavy silk.</p>
      <p>For a first attempt, avoid chiffon, georgette and satin, which slide constantly; net, which needs its own petticoat and lining; heavy kanjivaram and banarasi, where the pleats are hard to hold in one hand; and a stiff new starched cotton, which refuses to pleat and stands away from the body. The everyday soft cottons that sell most at a shop like ours are the kindest fabric to learn on, and a mistake on one costs you nothing.</p>
      <p>A pre stitched ready to wear saree is a perfectly reasonable choice for a first wedding, and there is nothing to apologise for in wearing one. Just know its limitation: it is stitched to one set of measurements and cannot be adjusted much, so take the size chart seriously before ordering.</p>

      <h2>How do you walk, sit and manage in a saree?</h2>
      <p>Walk with normal length steps and lift the front pleats very slightly with your left hand on stairs. To sit, smooth the pleats under you with one hand. To stand, gather the pleats in your hand instead of stepping on them.</p>
      <p>When you eat, tuck the end of the pallu into the waist at the back so it stays clear of your plate. On a two wheeler, gather the pleats to one side and hold them, or tuck them in firmly before you sit. In the monsoon, drape a little higher than usual and save the hem. Most importantly, practise once at home for twenty minutes before the day you need it. The first drape never goes the way you expect, and it goes much worse in a hurry.</p>
    `,
  },
  {
    slug: 'how-to-identify-real-cotton-fabric',
    title: 'How to Spot Real Cotton Fabric',
    description: 'How to identify real cotton fabric before you buy: the burn test, the water drop test, the crush test, and what price can and cannot tell you.',
    date: '2026-10-02',
    readMinutes: 7,
    excerpt: 'Four simple ways to check whether fabric is really cotton before you pay, what the burn test can and cannot prove, and when a blend is fine.',
    content: `
      <p>Cotton sells, so everything gets called cotton. Some of it is, some of it is a poly cotton blend, and a lot of what feels softest and coolest in the hand is viscose. None of that is necessarily bad, but you should know what you are paying for. Here are the checks that work, in the order of how useful they are.</p>

      <h2>How can you tell real cotton from a blend?</h2>
      <p>Use three quick checks together rather than trusting one. Real cotton absorbs a drop of water within a few seconds, holds sharp wrinkles when you crush it in your fist, and feels cool at first touch but warms up and goes limp in your hand. Polyester fails all three.</p>
      <p>No single test is conclusive, including the burn test. Run two or three, and when they agree you have your answer. When they disagree, you are probably holding a blend.</p>

      <h2>What do the crush and feel tests tell you?</h2>
      <p>Squeeze a handful of the fabric hard for five seconds and open your palm. Cotton keeps visible creases. Polyester springs back nearly smooth. A blend wrinkles slightly and then relaxes, which is exactly why blends are so popular for daily wear.</p>
      <p>On touch, cotton feels dry and slightly uneven. Polyester feels smooth, slick and faintly plasticky, and it stays at your hand temperature instead of cooling. Viscose feels cool and extremely smooth, almost liquid, and that is the fibre most often sold under the words cotton feel. Two more checks worth doing in the shop: hold the fabric up to light, where cotton yarn shows small irregularities and tiny slubs while polyester looks perfectly uniform, and breathe out through the fabric, where you will feel your breath pass through cotton and feel it blocked by tight polyester. One last clue over time: fabric that still looks crisp and bright after a year of Indian summers and weekly washing was probably never pure cotton.</p>

      <h2>Does the water drop test work?</h2>
      <p>Yes, and it is the most useful test you can do standing in a shop. Put a drop of water on the fabric. Cotton soaks it in within a few seconds and shows a dark patch. Polyester holds the drop as a bead sitting on the surface.</p>
      <p>Two limits. A new garment often carries starch or a finish that repels water until the first wash, so rub the spot between your fingers a few times before testing, and test on a seam allowance or inside hem rather than the front. And viscose and modal absorb water much like cotton does, so this test separates cotton from polyester, not cotton from rayon.</p>

      <h2>What does the burn test actually prove?</h2>
      <p>Only one thing: whether the fabric contains a melting, plastic based fibre. Cotton burns to soft ash. Polyester melts to a hard bead. That is the entire result. It cannot tell you cotton quality, thread count, the percentage in a blend, or cotton from viscose.</p>
      <table>
        <tr><th>Fibre</th><th>Flame and smell</th><th>What is left</th></tr>
        <tr><td>Cotton</td><td>Burns quickly with a yellow flame, smells like burning paper or dry leaves</td><td>Soft grey ash that crumbles to powder between your fingers</td></tr>
        <tr><td>Polyester or nylon</td><td>Shrinks away from the flame and melts, black smoke, sharp chemical smell</td><td>A hard dark bead you cannot crush</td></tr>
        <tr><td>Poly cotton blend</td><td>Burns and melts at the same time</td><td>Ash with small hard beads inside it</td></tr>
        <tr><td>Viscose, rayon or modal</td><td>Burns fast like cotton, similar paper smell</td><td>Light ash, almost identical to cotton</td></tr>
        <tr><td>Silk or wool</td><td>Burns slowly and tends to go out on its own, smells of burnt hair</td><td>Brittle black bead that crushes to powder</td></tr>
      </table>
      <p>That viscose row is the one people miss. The burn test cannot distinguish cotton from viscose, modal or bamboo rayon, because all of them are plant based and burn to ash. Since much of the soft, cool, smooth fabric sold loosely as cotton is actually viscose, the burn test will often tell you honestly that there is no polyester present and still leave your real question unanswered. If the distinction matters to you, ask the seller for the composition in writing.</p>

      <h2>How do you do the burn test safely?</h2>
      <p>Do it only on a few threads or a piece about one centimetre square, taken from an inside seam allowance, held with steel tweezers over a steel plate, near a window or outdoors, with nothing synthetic close by. Melting polyester drips, sticks to skin and keeps burning.</p>
      <ol>
        <li>Pull two or three threads from an inside seam, or cut a one centimetre piece from the seam allowance or inner hem. Never cut from a visible part of the garment.</li>
        <li>Hold the sample with steel tweezers or tongs over a steel plate or the kitchen sink, and keep a glass of water beside you.</li>
        <li>Do not do this while wearing a dupatta, a saree pallu or loose synthetic clothing, and tie your hair back.</li>
        <li>Touch a lighter flame to the sample for about a second, take the flame away, and watch both the burning and what remains.</li>
        <li>Let the residue cool before you touch it. A melted bead stays hot and sticky for several seconds.</li>
      </ol>
      <p>Two things not to do. Do not burn test a garment you may want to return, because a cut seam allowance means it is no longer in returnable condition. And do not do it to a shop fabric without asking first. In most cases the water and crush tests have already answered your question anyway.</p>

      <h2>Can you tell cotton by the price?</h2>
      <p>Only roughly. Price reflects weaving, printing and finishing as much as fibre, so a cheap garment can be honest coarse cotton and an expensive one can be a blend. Treat price as your weakest signal and your last check, never your first.</p>
      <p>In a printing and dyeing town like Balotra, plain cotton is a local commodity and simply is not expensive, which is why cotton nighties and cotton sarees can be cheap and still be cotton. On the other hand, fabric that is very cheap and also shiny, wrinkle free and perfectly even is almost never pure cotton. Spend your attention on the composition and the feel instead of reading the price tag as evidence.</p>

      <h2>What do labels like cotton feel and poly cotton actually mean?</h2>
      <p>Only 100% cotton is a composition claim. Cotton feel, cotton rich, cotton touch, cotton type and cotton like are descriptions of how a fabric behaves in the hand, not of what is in it, and they usually mean there is little or no cotton present.</p>
      <ul>
        <li><strong>100% cotton:</strong> all cotton.</li>
        <li><strong>Cotton rich:</strong> usually more than half cotton. Ask for the actual number.</li>
        <li><strong>Poly cotton, PC, 60:40, 65:35:</strong> a genuine blend, and generally labelled honestly.</li>
        <li><strong>Cotton feel, cotton touch, or cotton blend with no ratio:</strong> assume synthetic or viscose until somebody gives you a figure.</li>
        <li><strong>Hosiery cotton:</strong> a knitted cotton used for nighties and innerwear, often with a little elastane for stretch. That small amount of elastane is normal and actually desirable here.</li>
      </ul>

      <h2>Is a cotton blend always worse than pure cotton?</h2>
      <p>No. A blend is a trade off, not a cheat. Pure cotton breathes best in Indian heat and absorbs sweat, which is why it is the right choice for nighties and summer wear. A poly cotton blend creases less, dries faster in the monsoon and holds its shape longer.</p>
      <p>Choose pure cotton for anything worn against the skin for hours in the heat: nighties, petticoats, innerwear, summer kurtis. A blend makes sense for a garment you want to look pressed without ironing, or something that must dry overnight in the rains. What is not acceptable is paying a pure cotton price for a blend, or being told a fabric is cotton when it is viscose.</p>

      <h2>How do you check cotton when buying online?</h2>
      <p>Ask the seller for the fibre composition before you order, and read the return policy before you pay. You cannot feel fabric through a screen, so what protects you is a clear written answer and a return window you can actually use.</p>
      <ul>
        <li>Message the shop and ask the exact composition. A seller who knows gives you the answer in one line. We reply on WhatsApp at +91 9429429880, Monday to Saturday, 10 AM to 8 PM.</li>
        <li>Ask for a close up photograph in natural daylight. Weave irregularity and the true colour both show up in a good photo.</li>
        <li>Check the return terms. Ours are 7 days from delivery for any reason, including change of mind, as long as the item is unused, unwashed and the tags are intact. Innerwear cannot be returned once the pack is opened, for hygiene reasons.</li>
        <li>Do your fabric tests before washing, and work on an inside seam. Once a garment has been washed it is not returnable anywhere.</li>
        <li>For nighties and daily wear, order one piece and test it before you order four of the same.</li>
      </ul>
    `,
  },
  {
    slug: 'formal-shoe-size-guide-india',
    title: 'Formal Shoe Size Guide for India',
    description: 'Formal shoe size guide for India: measure your foot at home, convert UK, US and EU sizes, check width, and order the right fit online.',
    date: '2026-08-14',
    readMinutes: 6,
    excerpt: 'Most online shoe returns in India are size returns. Five minutes with paper and a scale gives you a number you can order from with confidence.',
    content: `
      <p>Formal shoes are the hardest thing to buy online, and size is almost always the reason a pair goes back. A cotton nighty forgives half an inch. A leather Oxford does not. The good news is that your foot is easy to measure properly at home with a sheet of paper, a pencil and a steel scale, and once you have the length in centimetres you can read it off a conversion chart instead of guessing from the number stamped inside an old pair that may itself have been the wrong size.</p>

      <h2>How do I measure my foot size at home?</h2>
      <p>Place a sheet of paper flat against a wall, stand on it with your heel touching the wall, and mark the paper at the tip of your longest toe. Measure from the wall to that mark in centimetres. Do both feet and use the longer one as your size.</p>
      <p>Small mistakes change the reading more than people expect, so keep these in mind:</p>
      <ul>
        <li><strong>Stand, do not sit.</strong> A foot spreads and lengthens when it carries your body weight. An outline traced with the foot lifted will read short, often by half a size.</li>
        <li><strong>Wear the socks you will actually use.</strong> For formal shoes that means thin cotton or blended socks, not thick sports socks. A thick pair can swallow four to five millimetres of room.</li>
        <li><strong>Hold the pencil upright.</strong> Tilting it so the tip slides under your toe pushes the mark forward and inflates the measurement.</li>
        <li><strong>Use a hard floor.</strong> Carpet, a durrie or a mattress lets the foot sink and the paper slide.</li>
        <li><strong>Note the longest toe, not the big toe.</strong> Many people have a second toe that is longer, and the shoe has to clear it.</li>
      </ul>
      <p>Write the number down in centimetres with one decimal place, for example 26.4 cm. That single number is more useful than any size you remember.</p>

      <h2>Should I measure my feet in the morning or evening?</h2>
      <p>Measure in the evening, after a normal day of walking and standing. Feet swell through the day, and in Indian heat they swell more. The same foot can read three to five millimetres longer at 8 PM than at 8 AM, and that much difference is enough to turn a comfortable shoe into a tight one by the end of a function.</p>
      <p>This matters most when you are buying shoes for long days on your feet: a wedding where you will stand through the reception, a daily commute in a crowded bus, a summer day of client visits. If you measure at 7 in the morning and order to that number exactly, the shoe will feel perfect when it arrives and punishing by evening. If you have already measured in the morning and cannot measure again, add about three millimetres before you read the chart.</p>

      <h2>What is the difference between UK, US and EU shoe sizes?</h2>
      <p>UK and US sizes run on the same scale but start from a different point, so a men US size is almost always one number higher than the equivalent UK size. EU sizes use a separate system with smaller steps, which is why one UK size sometimes maps to two EU numbers. Formal shoes sold in India usually follow UK sizing.</p>
      <p>Read the chart from your measured foot length, not from the size you have been buying:</p>
      <table>
        <tr><th>Foot length</th><th>UK / India</th><th>US (men)</th><th>EU</th></tr>
        <tr><td>24.1 cm</td><td>6</td><td>7</td><td>39 to 40</td></tr>
        <tr><td>24.9 cm</td><td>7</td><td>8</td><td>41</td></tr>
        <tr><td>25.7 cm</td><td>8</td><td>9</td><td>42</td></tr>
        <tr><td>26.5 cm</td><td>9</td><td>10</td><td>43</td></tr>
        <tr><td>27.3 cm</td><td>10</td><td>11</td><td>44</td></tr>
        <tr><td>28.1 cm</td><td>11</td><td>12</td><td>45</td></tr>
      </table>
      <p>Two honest warnings. First, charts are a starting point, not a law. Lasts differ, so the same UK 8 from two makers can feel different by a few millimetres. Second, if your measurement falls between two rows, think about the shoe style before you round. A lace-up Derby can take the larger size because the laces pull the fit in. A slip-on or loafer cannot, so the smaller size is usually safer there, since a loose slip-on will slide at the heel and give you blisters.</p>

      <h2>Why do shoes in my size still feel tight across the front?</h2>
      <p>Because length and width are two separate measurements, and most formal shoes sold in India come in a single standard width. If your foot is broad across the ball, the correct length will still pinch at the widest point, and going one size up only makes the shoe longer, looser at the heel and barely wider where it actually hurts.</p>
      <h3>How do I check my foot width?</h3>
      <p>Take a tailor tape, stand up, and wrap it around the widest part of your foot, across the ball just behind the toes. Keep it snug but not pulled tight and note the number. Compare it to your length. If the girth is noticeably more than your foot length minus about one and a half centimetres, you have a broad foot and should choose shape over size.</p>
      <p>For a broad foot, these choices help more than changing size:</p>
      <ul>
        <li><strong>Pick a Derby over an Oxford.</strong> The open lacing of a Derby opens wider across the instep.</li>
        <li><strong>Avoid sharply pointed toes.</strong> A round or slightly squared toe gives your toes room to sit side by side instead of being squeezed into a wedge.</li>
        <li><strong>Watch out for very sleek designs.</strong> A shoe that looks narrow in the photograph usually is narrow on the foot.</li>
        <li><strong>Remember that leather gives, but only sideways and only a little.</strong> Width eases with wear. Length never does.</li>
      </ul>

      <h2>Should I order the same size as my sports shoes?</h2>
      <p>No. Most people buy sports shoes half a size to a full size larger than their measured foot, because running shoes need forward room and thick socks. Copying that number into a formal shoe gives you a long shoe that slips at the heel, creases badly across the top and looks oversized under trousers.</p>
      <p>Go back to the measured length and read the chart again. A formal shoe should hold your heel firmly with about half a centimetre of space in front of your longest toe when you are standing. If your heel lifts clearly when you walk, the shoe is too long, not too loose in the laces.</p>

      <h2>What should I do when the shoes arrive?</h2>
      <p>Try them in the evening, indoors, on a clean floor, with the socks you plan to wear, and keep the box, tags and packing material until you are sure. Walk for ten minutes, including a few stairs. Judge the heel hold and the width at the ball first, because those are the things that will not improve.</p>
      <p>Check in this order:</p>
      <ol>
        <li>Can you slide one finger in behind your heel with the shoe laced? That is too loose.</li>
        <li>Does your heel lift off the insole when you walk? Too long.</li>
        <li>Can you press down and feel your longest toe at the very end? Too short.</li>
        <li>Is there a hard pinch across the ball that eases when you loosen the laces? That is a width problem, not a size problem.</li>
      </ol>
      <p>If the fit is wrong, you have time to act. At Mahalaxmi Fashion Hub a return can be raised within 7 days of delivery for any reason, including size, as long as the shoes are unused, unwashed and still have their tags, so keep the trial indoors and off the road. If the wrong size was sent, or the pair arrived damaged, report it within 48 hours with the parcel opening video and the return postage is reimbursed up to Rs. 100. If you simply changed your mind, the return postage is yours to pay, which is one more reason to spend five minutes with the paper and scale before ordering.</p>
    `,
  },
  {
    slug: 'how-to-care-for-leather-shoes-india',
    title: 'Leather Shoe Care in India',
    description: 'Leather shoe care in India: how to protect formal leather shoes through monsoon rain, dust and heat, with a simple weekly and monthly routine.',
    date: '2026-09-05',
    readMinutes: 6,
    excerpt: 'Monsoon damp, summer heat and road dust attack leather in different ways. Here is what to do each week, each month and after a soaking.',
    content: `
      <p>Formal leather shoes in India face three enemies in turn. Dust grinds at the surface for most of the year, heat dries the leather out, and the monsoon soaks it and then tries to grow fungus on it. None of this needs expensive products to manage. It needs a brush, a soft cloth, a tin of cream polish, old newspaper and the discipline to not wear the same pair two days running. That is most of the job.</p>

      <h2>How often should I polish my formal leather shoes?</h2>
      <p>Apply cream polish about once every two or three weeks of regular wear, not after every outing. What you should do after every wear is brush off the dust and wipe the shoe with a dry cloth. Dust removal and rest matter far more for the life of the leather than frequent polishing does.</p>
      <p>Polishing too often builds up layers of wax that sit on the surface, fill the natural grain and make the leather look plasticky instead of soft. The cream is there to put a little oil and colour back into the hide and to cover small scuffs. Once the shoe takes polish and still looks dull, it is usually asking for conditioning, not another coat of wax.</p>
      <h3>What is the correct order?</h3>
      <ol>
        <li>Brush off dust with a soft brush, including the welt and the seams where grit collects.</li>
        <li>Wipe with a slightly damp cloth and let the shoe dry fully.</li>
        <li>Work a small amount of cream polish in with a cloth or your fingers, in small circles.</li>
        <li>Leave it for ten to fifteen minutes.</li>
        <li>Buff with a clean dry cloth until the shine comes up.</li>
      </ol>

      <h2>What should I do if my shoes get soaked in the monsoon?</h2>
      <p>Act the same evening. Wipe the mud off with a damp cloth before it dries and sets, pull out the laces and the insole if it lifts, stuff the shoes loosely with crumpled newspaper, and leave them in a shaded place with moving air for a day or two. Change the paper after a few hours.</p>
      <p>Mud is the real damage, not water. As it dries it pulls moisture and oils out of the leather and leaves a gritty crust along the welt that cracks the surface when the shoe flexes. Getting it off while it is still soft prevents most of that. Once the shoes are completely dry, and only then, put a thin coat of cream or conditioner on. Leather that has been wet and dried is thirsty, and conditioning at that point is what stops the stiffness and the fine cracking that follows a hard monsoon.</p>

      <h2>Can I dry wet leather shoes in the sun or with a hair dryer?</h2>
      <p>No. Both do real damage. Direct sunlight and hot air dry the outer surface much faster than the inside, which shrinks and stiffens the leather, leaves it looking chalky, and can crack it along the flex line. Heat also softens the adhesive holding the sole and starts the sole separating.</p>
      <p>Shade and airflow are what you want. A fan on low pointed at the shoes from a distance is safe and fast. A dry room with an open window is fine. Do not stand them on a hot balcony floor in May either, which is the same mistake in a different season. If a pair feels damp inside after two days, change the newspaper again and give it another day rather than reaching for heat.</p>

      <h2>How do I stop white fungus growing on leather in humid weather?</h2>
      <p>Keep the shoes dry and keep air moving around them. Fungus and that powdery white bloom grow on the oils, sweat and dust left on leather when it sits in still, humid air, which is exactly what a closed cupboard in July provides. Air the shoes after every wear before they go away.</p>
      <p>If mould has already appeared, take the shoes outside, brush the bloom off with a dry brush so you are not rubbing it into the grain, then wipe the leather with a cloth dampened in water with a little white vinegar. Let them dry fully in the shade, then condition, because vinegar leaves the surface dry. Practical habits that prevent a repeat:</p>
      <ul>
        <li>Never put shoes straight into a closed box or cupboard while they are still warm and damp from your feet.</li>
        <li>Store them in a cotton cloth bag or a ventilated box, not sealed inside a plastic bag or wrapped in cling film.</li>
        <li>Drop a couple of silica gel sachets into the cupboard and replace them when they feel heavy.</li>
        <li>Open the cupboard and let it breathe for a while on dry days through the monsoon.</li>
        <li>Check the pairs you are not wearing at least once a month in the rainy season. Mould is easy to wipe off early and a nuisance once it has set in.</li>
      </ul>

      <h2>How do I protect shoes from dust and hard water marks?</h2>
      <p>Brush the dust off after every single wear, before it works into the seams. Road dust in most Indian cities is abrasive, and walking in it is a slow sanding of the finish. For the white rings that hard water leaves after a splash, wipe the whole panel with a damp cloth so the mark does not dry as a visible edge, then dry and polish.</p>
      <p>Hard water marks look alarming and are usually only mineral deposit on the surface. The trick is to treat the whole area rather than spot cleaning the mark, so the leather dries evenly. If the edge still shows, a light coat of matching cream polish will even it out. Suede and nubuck are a different matter, and water marks there need a suede brush and patience rather than cream.</p>

      <h2>Do shoe trees and newspaper actually help?</h2>
      <p>Both help, and honestly, newspaper does most of the work for almost nothing. Cedar shoe trees hold the shape, pull the creases out of the upper and absorb moisture, and they are genuinely good. But crumpled paper stuffed in firmly each evening does the shape holding and the moisture absorbing well enough for most wearers.</p>
      <p>Two cautions. Do not jam paper in so tightly that you stretch the upper out of shape, and do not use freshly printed newspaper against light coloured or white leather, because the ink can transfer. Plain paper or a paper towel layer against the leather solves that. If you own one good pair you wear often, a shoe tree is worth the money. If you own several pairs, paper plus rotation beats one tree used in one shoe.</p>

      <h2>Should I wear the same pair every day?</h2>
      <p>No. Give each pair a full day off after a day of wear. Your feet put a surprising amount of moisture into the lining in Indian weather, and leather needs around 24 hours to release it. Shoes worn daily stay damp inside, stretch out of shape, smell, and crack far sooner.</p>
      <p>Two pairs rotated will each outlast one pair worn daily by a wide margin, which is the single cheapest thing you can do for shoe life. At Mahalaxmi Fashion Hub men formal shoes are the second largest part of the stock, and the customers who come back least often with complaints are almost always the ones running two pairs in rotation.</p>

      <h2>What is a care routine I can actually keep?</h2>
      <p>Keep it short enough that you do it. A brush and a cloth kept near the door will do more for your shoes than a full kit kept in a cupboard you never open.</p>
      <table>
        <tr><th>When</th><th>What to do</th></tr>
        <tr><td>After every wear</td><td>Brush off dust, wipe with a dry cloth, loosen laces, stuff with paper, leave in open air overnight</td></tr>
        <tr><td>Every week</td><td>Clean the welt and seams properly, check the heel and sole for wear, air out the cupboard</td></tr>
        <tr><td>Every two to three weeks</td><td>Cream polish and buff</td></tr>
        <tr><td>Every two to three months</td><td>Condition the leather, more often in peak summer and after the monsoon</td></tr>
        <tr><td>After a soaking</td><td>Wipe mud off wet, remove laces, stuff with paper, dry in shade for one to two days, then condition</td></tr>
        <tr><td>Before long storage</td><td>Clean, condition, stuff, store in a cloth bag in a ventilated box, check monthly in the rains</td></tr>
      </table>
      <p>One last point about repairs. Watch the heel tip and the sole edge, and get them replaced when they start to wear through rather than after. Resoling a shoe with a sound upper costs a fraction of a new pair, and a worn heel changes how you walk long before it looks bad enough to notice.</p>
    `,
  },
  {
    slug: 'how-to-make-perfume-last-longer',
    title: 'Make Perfume Last in Summer',
    description: 'Make perfume last longer through an Indian summer day: where to spray, how skin and fabric change wear time, storage, and tricks that fail.',
    date: '2026-09-22',
    readMinutes: 5,
    excerpt: 'Perfume fades fastest in heat and sweat. Where you spray, how you prepare your skin and where you keep the bottle matter more than price.',
    content: `
      <p>Almost every complaint about a perfume not lasting in India comes down to the same three things: the heat, dry skin, and spraying in the wrong places. A fragrance that holds all day in a Delhi winter can vanish in ninety minutes in a Rajasthan May. You cannot change the weather, but you can change how and where you apply it, and that usually buys you several more hours from the same bottle.</p>

      <h2>Why does my perfume disappear within an hour in summer?</h2>
      <p>Heat makes fragrance evaporate faster, and sweat dilutes it and carries it off your skin. The light top notes that you smell first, usually citrus and fresh green notes, are the most volatile of all, so in 40 degree heat they burn off quickly and you are left thinking the whole thing has gone.</p>
      <p>Dry skin is the second cause and the one people miss. Fragrance oils need something to cling to. Skin that is dry from sun, hard water or air conditioning gives them nothing to hold, so they lift off almost immediately. The third cause is simple evaporation from an open surface: scent sprayed on an exposed forearm in the sun has a much shorter life than the same spray under a sleeve.</p>

      <h2>Where exactly should I spray perfume so it lasts longest?</h2>
      <p>Spray on warm spots that stay covered and do not sweat heavily: the base of the throat just below the collar, the inner elbows, the chest under the shirt, and the back of the neck under the hair. These are warm enough to lift the scent through the day and sheltered enough that it is not blasted off.</p>
      <p>In hot weather the wrists, which everybody uses, are one of the worst choices. You wash your hands many times a day, you wipe sweat with the back of your hand, you push up your sleeves, and the fragrance is gone by lunch. Avoid heavy sweat zones too, because sweat changes a fragrance as well as removing it, usually turning it sour.</p>
      <ul>
        <li><strong>Base of the throat.</strong> Warm, mostly covered, and it keeps the scent in your own breathing space.</li>
        <li><strong>Inner elbows.</strong> Good warmth, protected by sleeves, and the movement of your arms refreshes it.</li>
        <li><strong>Behind the knees.</strong> Useful under a kurta or a saree, because scent rises as you walk.</li>
        <li><strong>Back of the neck.</strong> Good for anyone whose hair covers it, as hair holds scent well.</li>
      </ul>

      <h2>Does rubbing your wrists together really ruin perfume?</h2>
      <p>It does not ruin the perfume, but it does cost you a little. Rubbing warms the skin and smears the fragrance, which speeds up the top notes and can make the opening smell flat sooner. The usual claim that it breaks the molecules is overstated. Let it dry on its own and you lose nothing.</p>
      <p>So do not panic if you have been rubbing for years. Just stop pressing and dabbing and let the spray sit.</p>

      <h2>Should I moisturise before spraying perfume?</h2>
      <p>Yes, and in Indian summer this is the single most effective step. Put an unscented moisturiser or a very small amount of plain coconut or almond oil on the spots where you will spray, let it settle for a minute, then spray. The oil gives the fragrance something to hold on to and noticeably slows how fast it fades.</p>
      <p>Keep it unscented or neutral, because a strongly perfumed body lotion will fight your fragrance and produce something neither of you chose. Use very little oil, especially before putting on light coloured clothes. The best moment for all of this is right after a bath, while skin is still slightly damp and warm, and before you dress.</p>

      <h2>Does spraying perfume on clothes make it last longer?</h2>
      <p>Yes. Fabric holds fragrance longer than skin does, often by hours, because it does not sweat and does not absorb the oils. The catch is real risk of staining. Many perfumes leave an oily or yellowish mark, and silk, chiffon and light cotton show it permanently.</p>
      <p>If you want to use clothing, spray the inside of a garment, a hem, or a scarf from a distance of about twenty centimetres, and test on a hidden corner first. Never spray directly onto a silk saree, a georgette dupatta or an embroidered or zari border, and never onto the front of a light shirt. At Mahalaxmi Fashion Hub both perfume and sarees sell side by side, and the one piece of advice we repeat most often is to dress first, step away, then spray, so nothing lands where it should not.</p>

      <h2>How much should I use, and when should I reapply?</h2>
      <p>Two to four sprays is enough for most eau de toilette and eau de parfum in hot weather, applied after your bath and before you dress. Expect to reapply once around the middle of the day in summer. That is normal and not a sign of a weak fragrance.</p>
      <p>The concentration on the bottle tells you roughly what to expect, and heat shortens all of it:</p>
      <table>
        <tr><th>Type</th><th>How it behaves in Indian heat</th><th>Best use</th></tr>
        <tr><td>Cologne or body mist</td><td>Fresh and light, fades quickest, often within a couple of hours</td><td>Mornings, gym, generous reapplication</td></tr>
        <tr><td>Eau de toilette</td><td>Moderate hold, usually needs one top up through a working day</td><td>Daytime, office, travel</td></tr>
        <tr><td>Eau de parfum</td><td>Strongest hold of the common types, heavier in heat</td><td>Evenings, functions, air conditioned days</td></tr>
      </table>
      <p>A practical habit is to decant a little into a small travel atomiser and keep it in your bag rather than carrying the main bottle, which will sit in heat and get knocked about.</p>

      <h2>How should I store perfume in Indian heat?</h2>
      <p>Keep the bottle inside a cupboard, in its box, away from sunlight and at as steady a temperature as you can manage. Heat and light break fragrance down, change its smell and dull its performance. A bathroom shelf and a dressing table near a window are the two worst places, and both are where most bottles live.</p>
      <p>The refrigerator does slow the ageing, but it brings its own problem: taking the bottle in and out causes condensation and temperature swings, and a fragrance bottle in a food fridge is awkward anyway. A dark cupboard in the coolest room of the house is good enough. Keep the cap on, because evaporation through an open neck is a slow steady loss, and do not decant into a pretty open container.</p>

      <h2>What does not work?</h2>
      <p>Several popular tricks give you very little. Knowing which ones to drop saves you money and fragrance.</p>
      <ul>
        <li><strong>Spraying into the air and walking through it.</strong> Most of it lands on the floor. Spray on skin.</li>
        <li><strong>Spraying only behind the ears.</strong> It is a small area and it is an oily, sweaty one, so it does not hold well on a hot day.</li>
        <li><strong>Spraying on hair.</strong> It does last, because hair holds scent, but the alcohol dries hair out and in summer it also sits on a scalp that sweats. Spray a hairbrush lightly instead if you want this.</li>
        <li><strong>Petroleum jelly on pulse points.</strong> It helps a little, far less than people claim, and it is sticky and unpleasant in humidity. Plain moisturiser does the job better.</li>
        <li><strong>Simply using more sprays.</strong> Beyond a few sprays you are not lasting longer, you are only becoming overpowering in a crowded room or a shared auto.</li>
        <li><strong>Keeping a bottle in a car.</strong> A closed car in an Indian summer is an oven, and it will wreck the fragrance faster than anything else on this list.</li>
      </ul>
      <p>Lastly, choose for the season. Heavy oud, amber and sweet gourmand fragrances can become cloying in 40 degree heat, while citrus, vetiver, aquatic and light floral notes read as fresh even though they fade sooner. Wearing something lighter and reapplying once is usually more pleasant than wearing something heavy and regretting it by noon.</p>
    `,
  },
  {
    slug: 'cash-on-delivery-online-shopping-india',
    title: 'Cash on Delivery in India',
    description: 'Cash on Delivery in India explained: how COD works, what to check before you pay the courier, and what to do if the item is wrong or damaged.',
    date: '2026-10-02',
    readMinutes: 6,
    excerpt: 'Cash on Delivery protects you less than most people assume. Knowing what to check at the door and what to film after opening is the real safeguard.',
    content: `
      <p>Cash on Delivery is still the way a very large share of India shops online, and for good reason. It removes the fear of paying a shop you have never dealt with. But many people believe COD protects them more than it actually does, and that belief leads to the one mistake that costs them later: paying, tearing the parcel open, and having no way to prove what was inside. This article explains how COD really works, what you can and cannot do at your door, and what to do in the first few minutes after you pay.</p>

      <h2>How does Cash on Delivery actually work?</h2>
      <p>You place the order without paying. The shop packs it, hands it to a courier, and the courier collects the cash from you when the parcel reaches your address. The courier then settles that money with the shop later. The shop has shipped the goods and paid for the shipping before it has seen a rupee.</p>
      <p>That last point explains a few things customers find odd. It is why some pin codes do not support COD, why some shops set a maximum COD value, and why shops ask you to confirm an order over the phone before dispatching. It is also why every COD parcel has an order ID and an AWB number, which is the courier tracking number. At Mahalaxmi Fashion Hub COD is available everywhere in India alongside UPI, cards and net banking, orders are dispatched in one to two business days through Delhivery, and most parcels reach customers four to ten business days after the order is placed, trackable the whole way by order ID or AWB.</p>

      <h2>Can I open the parcel before I pay the delivery agent?</h2>
      <p>Usually no, and it is better to know this in advance. In India the normal rule is payment first, then the parcel is yours. Most delivery agents cannot mark an order as delivered in their app until payment is taken, and they are moving through a long route, so they will not wait while you unpack.</p>
      <p>Some agents will let you look at the sealed parcel, shake it, weigh it in your hand or photograph the label. A few will allow a quick open if they know you. That is their discretion, not your right, and arguing about it at the gate rarely works and sometimes ends with the parcel going back undelivered. What you can always do is inspect the outside of the parcel carefully and refuse to accept it before paying if something is clearly wrong. Once you have paid and the agent has left, your protection shifts entirely to what you record while opening.</p>

      <h2>What should I check before I accept and pay for a COD parcel?</h2>
      <p>Check four things on the outside: that the name and address on the label are yours, that the order ID or AWB matches the order you are expecting, that the amount the agent asks for matches the amount in your order confirmation, and that the packaging is intact, properly sealed and not re-taped, crushed or wet.</p>
      <p>Go through this quickly but do go through it:</p>
      <ul>
        <li><strong>The amount.</strong> Pay what your order confirmation says, not what the agent says. Mismatches happen and are much easier to sort out before money changes hands than after.</li>
        <li><strong>The seal.</strong> Original tape and a flat, undisturbed packet. Fresh tape over a slit, a re-stitched bag or a parcel that has been opened and closed is a reason to refuse.</li>
        <li><strong>The weight and feel.</strong> You know roughly what you ordered. A box for shoes that feels almost empty, or a perfume parcel with loose rattling inside, is worth stopping for.</li>
        <li><strong>Damage.</strong> Wet corners from rain, a crushed box, visible leakage. Note it before paying, not after.</li>
        <li><strong>Keep the label.</strong> Photograph the full label before you cut anything, including the AWB number. It is the single most useful piece of evidence in any dispute.</li>
      </ul>
      <p>You are allowed to refuse a parcel. If the outside is clearly wrong, refuse, do not pay, and contact the shop the same day with photographs. A refused parcel returns to the shop and can be sorted out from there.</p>

      <h2>What should I do in the first few minutes after I pay?</h2>
      <p>Start a video on your phone before you cut the tape, and keep recording in one unbroken clip until every item is out of the packet and shown clearly. This opening video is the real protection in COD shopping, because it is the only thing that proves what arrived in that specific sealed parcel.</p>
      <h3>What makes an opening video useful?</h3>
      <ol>
        <li>Start with the parcel sealed and show the shipping label and AWB number clearly enough to read.</li>
        <li>Turn the parcel over and show all sides, including the tape, before you touch it.</li>
        <li>Do not stop the recording at any point. One continuous clip is worth far more than several short ones.</li>
        <li>Shoot in good light, in a room, not in a dark stairwell.</li>
        <li>Open with a blade or scissors slowly and keep the packaging in frame.</li>
        <li>Show each item, its tags, its size label, and the invoice if one is enclosed.</li>
        <li>If something is wrong, show the specific problem on camera: the stain, the crack, the broken seal, the wrong size on the tag.</li>
        <li>Do not trim or edit the clip afterwards.</li>
      </ol>
      <p>Most orders are fine and you delete the video the next day. It takes under two minutes and it is the difference between a straightforward replacement and a long argument.</p>

      <h2>What are my rights if the item is damaged, defective or wrong?</h2>
      <p>If the shop made the mistake, the shop should put it right at its own cost, and you need to report it quickly with evidence. At Mahalaxmi Fashion Hub a damaged, defective, wrong item or wrong size sent must be reported within 48 hours with the parcel opening video, and the shop then reimburses the return postage up to Rs. 100.</p>
      <p>It helps to understand the two different situations, because they are treated differently everywhere, not just at one shop:</p>
      <table>
        <tr><th>Situation</th><th>Shop made a mistake</th><th>You changed your mind</th></tr>
        <tr><td>What it covers</td><td>Damaged, defective, wrong item or wrong size sent</td><td>Did not like it, size did not suit, no longer needed</td></tr>
        <tr><td>Window to raise it</td><td>Report within 48 hours with the opening video</td><td>Within 7 days of delivery</td></tr>
        <tr><td>Who pays return postage</td><td>The shop reimburses up to Rs. 100</td><td>You pay it</td></tr>
        <tr><td>Condition required</td><td>As received, with tags</td><td>Unused, unwashed, tags intact</td></tr>
      </table>
      <p>Two things are worth noting. Returns travel back by India Post Speed Post, so keep the posting receipt, since that receipt is what proves you sent the parcel. And women innerwear cannot be returned once the pack is opened, for hygiene reasons, which is standard practice and worth remembering before you open that particular packet.</p>

      <h2>How does a COD refund reach me?</h2>
      <p>By bank transfer. You paid in cash, so there is no card or UPI transaction to reverse, which means the shop needs your bank details to send the money back. Refunds are processed 5 to 7 business days after the returned item has been received and checked, so the clock starts at the shop, not at the post office.</p>
      <p>To avoid delay, send the account holder name exactly as it appears in the bank record, the account number, and the IFSC, and check them twice. Send the Speed Post tracking number at the same time so the return can be matched to your order. A refund that is held up is almost always a mismatched name or a wrong digit in the account number.</p>

      <h2>Is COD better than paying online?</h2>
      <p>COD is better when you are buying from a shop for the first time and want to see the parcel before any money leaves your hands. Prepaid is better when you want a faster refund if something goes wrong, because the money is already in the system. Both are safe with an established shop, and the honest answer is that it depends on which risk bothers you more.</p>
      <ul>
        <li><strong>Refund speed.</strong> A prepaid refund usually moves faster because no bank details have to be collected and verified.</li>
        <li><strong>Cash at the door.</strong> You need the correct amount ready. Agents often cannot give change, and not all of them can accept UPI at the door.</li>
        <li><strong>Availability.</strong> COD can be unavailable for some pin codes or above a value limit, while prepaid always works.</li>
        <li><strong>Shipping cost is the same either way.</strong> At Mahalaxmi Fashion Hub shipping is free above Rs. 999 and a flat Rs. 60 below that, whichever way you pay.</li>
      </ul>

      <h2>What makes a COD order arrive late?</h2>
      <p>The most common cause is an unanswered phone. Delivery agents call before they arrive, and if the call does not connect they mark the attempt as failed and move on. Two or three failed attempts and the parcel goes back to the shop as a return, which wastes a week or more.</p>
      <p>Keep the phone number on the order reachable, add a landmark to the address rather than only the house number, and tell the agent if you will not be home so a reattempt can be arranged. If a parcel seems stuck, check the tracking with your order ID or AWB first, then call the shop with that number in hand. On a question about any order you can reach Mahalaxmi Fashion Hub on phone or WhatsApp at +91 9429429880, Monday to Saturday between 10 AM and 8 PM, and having the order ID ready will always get you a faster answer than describing the item.</p>
    `,
  },
];

export const getPost = (slug: string) => POSTS.find(p => p.slug === slug);
