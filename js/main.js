document.addEventListener('DOMContentLoaded', () => {
    // ----------------------------------------------------
    // Language Logic
    // ----------------------------------------------------
    const langToggleBtn = document.getElementById('lang-toggle');
    const langText = langToggleBtn.querySelector('.lang-text');
    let currentLang = localStorage.getItem('lang') || 'ar'; // Default to Arabic

    const setLanguage = (lang) => {
        currentLang = lang;
        localStorage.setItem('lang', lang);

        // Set HTML attributes
        document.documentElement.lang = lang;
        document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';

        // Update Text Content
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (translations[lang][key]) {
                // Use innerHTML to allow for formatting like <br> or spans
                el.innerHTML = translations[lang][key];
            }
        });

        // Update Placeholders
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (translations[lang][key]) {
                el.placeholder = translations[lang][key];
            }
        });

        // Update Button Text
        langText.innerText = lang === 'ar' ? 'EN' : 'AR';

        // Update Font Family
        if (lang === 'ar') {
            document.body.style.fontFamily = "'Cairo', sans-serif";
            document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => h.style.fontFamily = "'Cairo', sans-serif");
        } else {
            document.body.style.fontFamily = "'Outfit', sans-serif";
            document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => h.style.fontFamily = "'Outfit', sans-serif");
        }
    };

    // Initialize Language
    setLanguage(currentLang);

    // Toggle Button Click
    langToggleBtn.addEventListener('click', () => {
        const newLang = currentLang === 'ar' ? 'en' : 'ar';
        setLanguage(newLang);
    });


    // ----------------------------------------------------
    // UI Logic (Existing)
    // ----------------------------------------------------

    // Mobile Menu Toggle
    const menuToggle = document.querySelector('.menu-toggle');
    const navLinks = document.querySelector('.nav-links');

    menuToggle.addEventListener('click', () => {
        navLinks.classList.toggle('active');
        const icon = menuToggle.querySelector('i');
        if (navLinks.classList.contains('active')) {
            icon.classList.remove('fa-bars');
            icon.classList.add('fa-times');
        } else {
            icon.classList.remove('fa-times');
            icon.classList.add('fa-bars');
        }
    });

    // Close menu when clicking a link
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('click', () => {
            navLinks.classList.remove('active');
            menuToggle.querySelector('i').classList.remove('fa-times');
            menuToggle.querySelector('i').classList.add('fa-bars');
        });
    });

    // Smooth Scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Scroll Animation (Staggered & Fade Up)
    const observerOptions = {
        threshold: 0.15,
        rootMargin: "0px 0px -50px 0px"
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Add specific animation class based on element type or data attribute
                if (entry.target.classList.contains('service-card') || entry.target.classList.contains('stat-card')) {
                    entry.target.classList.add('animate-zoom-in');
                } else {
                    entry.target.classList.add('animate-fade-up');
                }

                // Stop observing once animated
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Initial Hero Animation (Trigger immediately)
    setTimeout(() => {
        document.querySelectorAll('.hero .text-content > *').forEach((el, index) => {
            el.classList.add('animate-fade-up');
            el.style.animationDelay = `${index * 150}ms`;
        });
        document.querySelector('.hero-visual').classList.add('animate-zoom-in');
    }, 100);

    // Apply observer to other sections
    const animatedElements = document.querySelectorAll('.section-header, .about-text, .service-card, .stat-card, .feature, .contact-wrapper, .interactive-card');
    animatedElements.forEach((el, index) => {
        el.classList.add('animate-on-scroll'); // CSS class to hide initially

        // Add staggering delays for elements in the same container (simple implementation)
        if (el.parentElement.classList.contains('services-grid') || el.parentElement.classList.contains('about-stats') || el.parentElement.classList.contains('features-grid')) {
            // Calculate index within parent to stagger
            const childIndex = Array.from(el.parentElement.children).indexOf(el);
            el.style.animationDelay = `${childIndex * 150}ms`;
        }

        observer.observe(el);
    });

    // Header transparency on scroll
    const navbar = document.querySelector('.navbar');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // Masked Text Reveal Observer
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                revealObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.reveal-text').forEach(el => {
        revealObserver.observe(el);
    });

    // Handle Contact Form Submission
    const contactForm = document.querySelector('.contact-form');
    if (contactForm) {
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const btn = contactForm.querySelector('button');
            const originalText = btn.innerText;
            btn.innerText = 'Sending...'; // This should also ideally be translated
            btn.disabled = true;

            const name = contactForm.querySelector('input[type="text"]').value;
            const email = contactForm.querySelector('input[type="email"]').value;
            const service = contactForm.querySelector('select').value;
            const message = contactForm.querySelector('textarea').value;

            try {
                const res = await fetch('http://localhost:3000/api/contact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, service, message })
                });

                const data = await res.json();

                if (res.ok) {
                    alert('Thanks! Message sent successfully.');
                    contactForm.reset();
                } else {
                    alert('Error: ' + data.error);
                }
            } catch (err) {
                console.error(err);
                alert('Something went wrong. Please try again later.');
            } finally {
                btn.innerText = originalText;
                btn.disabled = false;
            }
        });
    }
});
