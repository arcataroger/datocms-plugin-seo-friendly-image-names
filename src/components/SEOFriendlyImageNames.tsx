import {Button, Canvas} from 'datocms-react-ui';
import type {NewUpload, RenderFieldExtensionCtx} from "datocms-plugin-sdk";
import type {Item, Upload} from '@datocms/cma-client/dist/types/generated/SimpleSchemaTypes'
import {useEffect, useMemo, useState} from "react";
import {buildClient, LogLevel} from '@datocms/cma-client-browser';

// Borrowing a typedef from the plugin SDK. This is what our asset gallery returns in formValues
type AssetGalleryMetadata = NonNullable<NewUpload['default_field_metadata']>[string] & { upload_id: string };
type CollectionRecord = Item & { product_type?: string }
type ImageNeedingUpdate = { id: string, currentFilename: string, slugifiedFilename: string }

const slugifyProductType = (productType: string): string => {

    // TODO replace this with a locale-aware slugify lib, but only if they want localized filenames

    const slugified: string = productType.toLocaleLowerCase("en-US")
        .replace(/\s+/g, '-')

    const pluralized = `${slugified}s`

    return pluralized;
}

const slugifyImageName = (productInfo: {
    productType: string,
    productHandle: string
    imgExtension: string,
    imgMimeType?: string,
    numberSuffix: string | number,
}): string => {
    const {productType, productHandle, imgExtension, imgMimeType, numberSuffix} = productInfo;

    const mediaType: string = imgMimeType?.startsWith('video') ? 'video' : 'image';
    return `${slugifyProductType(productType)}-${productHandle}-${mediaType}-${numberSuffix}.${imgExtension}`;
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

    const [images, setImages] = useState<Upload[]>([])
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
                    const ids = galleryItems.map(img => img.upload_id)
                    const images = await client.uploads.list({
                        filter: {
                            ids: ids.join()
                        }
                    })

                    // But they come back out-of-order, so we have to manually sort them
                    if (images) {
                        let reorderedImages: Upload[] = []
                        images.forEach(img => {
                            const originalIndex = ids.indexOf(img.id)
                            reorderedImages[originalIndex] = img;
                        })
                        setImages(reorderedImages)
                    }
                }


            } catch (err) {
                console.error(err)
            }

        })()
    }, [collectionId, galleryItems])

    /** Identify images needing a filename update **/

    const slugifiedImageNames = useMemo<string[]>(() =>
        images.map(img => slugifyImageName({
            productType,
            productHandle,
            imgExtension: img.format ?? img.filename.match(/\.([0-9a-z]+)(?:[?#]|$)/i)?.[1] ?? '',
            imgMimeType: img.mime_type ?? undefined,
            // numberSuffix: index + 1 // This makes it pretty confusing when they are reordered in the gallery
            numberSuffix: img.md5.slice(0, 5) // We can use a shortened hash instead to better keep track of them
        })), [images])

    const imagesNeedingUpdate = useMemo<ImageNeedingUpdate[]>(() =>
        images.flatMap(((img, index) => {
            if (img.filename !== slugifiedImageNames[index]) {
                return [{
                    id: img.id,
                    currentFilename: img.filename,
                    slugifiedFilename: slugifiedImageNames[index]
                }]
            } else {
                return []
            }
        })), [images, slugifiedImageNames])

    return (
        <Canvas ctx={ctx}>
            <Button type="button" buttonSize="xxs">
                Add lorem ipsum
            </Button>

            <h3>Debug:</h3>
            <h4>Filenames needing update</h4>
            <ul>
                {imagesNeedingUpdate.map(img => <li key={img.id}>(#{img.id}) {img.currentFilename} should be {img.slugifiedFilename}</li>)}
            </ul>

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