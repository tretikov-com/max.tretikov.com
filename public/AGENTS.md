# Hi! 

You're my agent, and I'm your operator. I'd like you to get to know a little bit about me, how I operate, and how I like to tackle projects. I want to work as effectively as possible together. I've tried my best to get to know you, but I play with memories disabled, so here's me.

## Bio(graphy)

I'm a bioengineering major at UC Berkeley. All of the parental figures in my life were computer scientists, so I got into programming very early. By the time I was 5, I had my own computer, and I played math games and programming HTML and JS on Khan academy. By the time I was 11, I had discovered machine learning, and I was awestruck by the power of the technique. It hit me immediately that this was a universal function approximator (a nomenclature I had settled on at the time, independently and far before it was popular). I saw it as a 23rd century technology in the 21st century. I got to work, doing my own little text generation and image generation projects. In time, I graduated high school at 15. During this time, my mathematician grandfather had stage 4 stomach cancer. Through an experimental surgery, and his lifelong commitment to athleticism, he was able to recover and go into remission. Although he survived, he was left with a neuropathy that left him feeling cold even when it was hot, in pain frequently, his eyes dry but always crying. At the same time, I was going through my own struggles with severe MDD, which went untreated throughout my high school. Not to blame it, but it's no coincidence that I ended with grades not good enough to make it into a top university. I worked for Harvard on their pandemic roadmap, doing data science and their website; I worked for a French startup using computer vision on satellite imagery for climate action, an early experiment in building a digital twin; and I worked in the industry, creating AI for image and text generation. It was this last experience that disillusioned me with the direction of contemporary AI. I felt like ML is this powerful tool that should be used on something that can change lives. My machine learning background is much stronger than my bio background, but I had seen so much pain through disease, even personally in my life. It felt like a no-brainer. I went to community college, did my prereqs in a year, and got into Berkeley Bioengineering. I really want to get research done here and at Stanford. But what do I want to research? What are my ideas for progress?

## Progress

Biology, let alone human biology, is too complex for any human to truly comprehend. There is too much data, too many moving parts. Machine learning is the perfect tool for this, a way to predict outcomes, synthesize vast data, and *understand* biology. Ultimately, we're going to need AI to design new actors in biology -- de novo new-to-nature enzymes, proteins, and small molecule binders; virtual cell simulations; we can also use it to crunch a vast wealth of bioinformatic data for patients that would otherwise be too expansive for a human doctor to parse. In general, I believe bioML is the future of biology, and the future of machine learning. But there are so many hurdles to this. Primarily: there's a data dearth in biology. There are too many experiments, of great expense to run. So what do we do? We make synthetic data. We figure out how to simulate, with haste, at scale, precisely. For real data collection, I have other plans (next paragraph). We also need to consider the use of novel architectures in biology, while being aware of the bitter lesson. Diffusion has already upended generative molecular biology. What other improvements can we get at the cutting edge of more general machine learning work?

My ultimate goal right now is to build a system that can use AI to analyze and treat one human body: an RF-to-RNA (and vice versa) enzyme. It would have nanoradio antennas and would be able to turn a digital signal into mRNA fragments, which can screen for cell with a riboregulator sequence looking for spatial transcriptomic sequences; and would be able to transmit mRNA fragments with a header sequence given by that riboregulated mRNA. We can use the whole field of synthetic biology to achieve complex multivariable calculation within the cell. But there are so many hurdles to this. As stated before, we can't make new to nature enzymes that are this freaky because of the gap between data and compute in bioML right now. The synthetic data approach, combined with robotic automated labs, I believe will give us enough data to make my RfNA enzymes. From there, we get a SHITLOAD of data from an in-vivo living cell, rather than current expensive methods of lysing a cell, extracting and sequencing RNA, in an apoptosed dead state. But this is just one pet project. In general, I'm interested in all kinds of machine learning applications to biology: most concentrated at the ends, molecular biology on one side and medical physiology on the other.

So this is where you come in, to help write bioML software. But how?

## Philosophy

ALWAYS start with the minimum viable product. YAGNI, only build things we need right now. That being said, I prioritize elegance and abstraction. DRY. Always make a system extensible and modular, just not overengineered.

When you remove something, you don't need to write that you removed it, or add tests to ensure it stays removed. You just remove it. You don't need to keep anything backwards compatible with things you wrote in the past. Move forwards, eternally. Imagine that what you're writing is being read for the first time by someone with no context. Only keep that kind of info in your own documents (only read by machine), if you absolutely must (don't forget you have a biiiig context window).

When looking online for applications or libraries, prioritize libre -> gratuit -> commercial. Open source on top.

# Current projects

This is absolutely non-exhaustive. Don't base a lot of decisions around these, they're just an inkling of what I'm interested in. Good for directional checksumming but don't overfit on them.

serious:
- RfNA (discussed)
- Reinforcement Learning from Quantum Feedback (RLQF): getting QM-level accuracy with MM-level speed by using QM as a teacher in RL

less serious:
- oionopolos: predicting the results of clinical trials with bleeding-edge SOTA models
- calchas: using oionopolos to predict stock jumps of biotech companies

# Professors I like (and need to reach out to)

- Jennifer Listgarten
- Brian Hie, Patrick Hsu (everyone at Arc)
- BioML people
- bleeding-edge machine learning people, especially those working on low-data regimes