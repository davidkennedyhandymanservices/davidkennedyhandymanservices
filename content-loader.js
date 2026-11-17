(async () => {
    try {
        const response = await fetch('site-content.json');
        if (!response.ok) {
            throw new Error(`Could not load site content (${response.status})`);
        }
        const content = await response.json();

        if (content.seo?.title) {
            document.title = content.seo.title;
        }
        document.querySelector('meta[name="description"]')?.setAttribute('content', content.seo?.description || '');
        document.querySelector('meta[name="keywords"]')?.setAttribute('content', content.seo?.keywords || '');

        document.querySelectorAll('[data-content="businessName"]').forEach((element) => {
            element.textContent = content.businessName;
        });
        document.querySelectorAll('[data-content="tagline"]').forEach((element) => {
            element.textContent = content.tagline;
        });

        const phoneNumber = String(content.phone || '').trim();
        const phoneDigits = phoneNumber.replace(/\D/g, '');
        const phoneHref = `tel:${phoneNumber.startsWith('+') ? '+' : ''}${phoneDigits}`;
        document.querySelectorAll('[data-content-phone]').forEach((element) => {
            element.setAttribute('href', phoneHref);
        });
        document.querySelectorAll('[data-content-phone-display]').forEach((element) => {
            element.textContent = content.phone;
        });

        if (content.logo) {
            document.querySelectorAll('[data-content-logo]').forEach((element) => {
                const image = document.createElement('img');
                image.src = content.logo;
                image.alt = `${content.businessName} logo`;
                image.className = 'h-10 max-w-36 object-contain';
                element.replaceChildren(image);
                element.className = 'shrink-0';
            });
        }

        content.services?.forEach((service, index) => {
            document.querySelectorAll(`[data-service-title="${index}"]`).forEach((element) => {
                element.textContent = service.title;
            });
            document.querySelectorAll(`[data-service-description="${index}"]`).forEach((element) => {
                element.textContent = service.description;
            });
        });

        content.gallery?.forEach((item, index) => {
            document.querySelectorAll(`[data-gallery-image="${index}"]`).forEach((element) => {
                element.src = item.src;
                element.alt = item.alt;
            });
            document.querySelectorAll(`[data-gallery-title="${index}"]`).forEach((element) => {
                element.textContent = item.title;
            });
            document.querySelectorAll(`[data-gallery-location="${index}"]`).forEach((element) => {
                element.textContent = item.location;
            });
            document.querySelectorAll(`[data-gallery-description="${index}"]`).forEach((element) => {
                element.textContent = item.description;
            });
        });
    } catch (error) {
        console.error('Unable to apply editable website content. Serve the site over HTTP and check site-content.json.', error);
    }
})();
