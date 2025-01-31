import {connect} from "datocms-plugin-sdk";
import "datocms-react-ui/styles.css";
import {render} from "./utils/render";
import {SEOFriendlyImageNames} from "./components/SEOFriendlyImageNames.tsx";

connect({
    manualFieldExtensions() {
        return [
            {
                id: 'seoFriendlyImageNames',
                name: 'SEO-Friendly Image Names',
                type: 'addon',
                fieldTypes: ['gallery'],
            },
        ];
    },
    renderFieldExtension(id, ctx) {
        if (id === 'seoFriendlyImageNames') {
            render(<SEOFriendlyImageNames ctx={ctx}/>)
        }
    }
});
