import {RenderConfigScreenCtx} from "datocms-plugin-sdk";
import {Canvas} from "datocms-react-ui";

export const GlobalConfigScreen = ({ctx}: {ctx: RenderConfigScreenCtx}) => {
    return <Canvas ctx={ctx}>
        <p><strong>✅ The SEO-friendly image names plugin is installed and working!</strong></p>

        <p>This plugin has no global configuration options. Instead:</p>
        <ul>
            <li>The API key is set inside the plugin's environment variables, not here</li>
            <li>Each Asset Gallery field needs to have this plugin individually enabled</li>
            <li>You can set filename templates and other settings on a per-field basis in that field's appearance
                settings
            </li>
        </ul>
    </Canvas>
}