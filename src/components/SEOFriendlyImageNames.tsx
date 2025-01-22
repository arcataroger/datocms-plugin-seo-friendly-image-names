import {Button, Canvas} from 'datocms-react-ui';
import type {NewUpload, RenderFieldExtensionCtx} from "datocms-plugin-sdk";
import type {Item, UploadInstancesTargetSchema} from '@datocms/cma-client/dist/types/generated/SimpleSchemaTypes'
import {useEffect, useMemo, useState} from "react";
import {buildClient, LogLevel} from '@datocms/cma-client-browser';


// Borrowing a typedef from the plugin SDK. This is what our asset gallery returns in formValues
type AssetGalleryMetadata = NonNullable<NewUpload['default_field_metadata']>[string] & { upload_id: string };
type CollectionRecord = Item & { product_type?: string }

const slugifyProductType = (productType: string): string => {

    // TODO replace with a locale-aware slugify lib

    const slugified: string = productType.toLocaleLowerCase("en-US")
        .replace(/\s+/g, '-')

    const pluralized = `${slugified}s`

    return pluralized;
}

export const SEOFriendlyImageNames = ({ctx}: { ctx: RenderFieldExtensionCtx }) => {

    // Limited-permission API token from https://vrai.admin.datocms.com/environments/datocms-support-plugin-testing/project_settings/access_tokens/321640/edit
    // You could also use ctx.currentUserAccessToken instead, but that has all the permissions of the current editor. This way is safer.
    const accessToken = import.meta.env.VITE_DATOCMS_LIMITED_ACCESS_TOKEN

    /** Basic setup **/
        // These are provided to us by the plugin SDK. They are passed from main.tsx.
    const {formValues, fieldPath} = ctx;

    // The asset gallery images (or technically, just their metadata)
    const galleryItems = formValues[fieldPath] as AssetGalleryMetadata[]

    // Shopify product handle
    const productHandle = formValues['shopify_product_handle'] as string

    // Shopify collection, which we'll need to look up the product category
    const collectionId = formValues['collection'] as string

    const [images, setImages] = useState<UploadInstancesTargetSchema>([])
    const [collection, setCollection] = useState<CollectionRecord | null>(null)

    const productType = useMemo(() => {

        if (!collection) return '';

        if (collection['product_type']) {
            return collection['product_type']
        } else {
            console.warn(`Product type not found in collection ${collectionId}`)
            return ''
        }
    }, [collection])

    /** Fetch needed data from the CMA and update our local state **/

    useEffect(() => {
        (async () => {

            console.log('starting fetches')

            try {
                // Initialize Dato CMA client
                const client = buildClient({
                    apiToken: accessToken,
                    environment: 'datocms-support-plugin-testing', // Replace with primary once tested
                    logLevel: LogLevel.BODY,
                })

                // Get the product type from the collection Id
                const collection = await client.items.find(collectionId)
                if (collection) {
                    setCollection(collection)
                }

                // Get existing image information
                if (galleryItems.length >= 1) {
                    const images = await client.uploads.list({
                        filter: {
                            ids: galleryItems.map(img => img.upload_id).join()
                        }
                    })
                    if (images) {
                        setImages(images)
                    }
                }


            } catch (err) {
                console.error(err)
            }

        })()
    }, [collectionId, galleryItems])


    return (
        <Canvas ctx={ctx}>
            <Button type="button" buttonSize="xxs">
                Add lorem ipsum
            </Button>
            <h2>Image filenames would be:</h2>
            <ul>
                {images.map((img, index) => {
                    return <li
                        key={img.id}>{slugifyProductType(productType)}-{productHandle}-{img.mime_type?.startsWith('video') ? 'video' : 'image'}-{index + 1}.{img.format}</li>
                })}
            </ul>
            <h3>Debug:</h3>
            <ul>
                <li>{galleryItems.length} images detected</li>
                <li>Collection ID: {collectionId}</li>
                <li>Shopify handle: {productHandle}</li>
                <li>Product type: {productType}</li>
            </ul>

            <pre>
                {/*{JSON.stringify(images, null, 2)}*/}
            </pre>

        </Canvas>
    );
};