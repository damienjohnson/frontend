import RNFS from 'react-native-fs'
import { v5 as uuidv5 } from 'uuid'
import qs from 'query-string'
import priorityQueue from 'async/priorityQueue'

/**
 * 
 */
const generateSignature = (source) => {
  if (typeof source !== 'string' || !source.length) {
    return {
      partial: '',
      path: '',
      isRemote: '',
    }
  }

  const parsed = qs.parseUrl(source)
  const partial = qs.parseUrl(source).url.split('cloudfront.net')[1]
  const uuid = uuidv5(partial || parsed.url, uuidv5.URL)
  const isRemote = source.includes('http://') || source.includes('https://')
  
  const path = isRemote ? `${RNFS.CachesDirectoryPath}/${uuid}.jpg` : source

  return {
    source,
    partial,
    path,
    isRemote,
  }
}

/**
 * 
 */
export const checkImage = async (signature) => {
  return await RNFS.exists(signature.path)
}

/**
 * 
 */
export const fetchImage = async ({ signature, progressCallback, beginCallback }) => {
  const { promise, jobId } = RNFS.downloadFile({
    fromUrl: signature.source,
    toFile: signature.path,
    background: true,
    discretionary: true,
    cacheable: false,
    readTimeout: 6000,
    backgroundTimeout: 12000,
    resumable: () =>
      RNFS.isResumable(jobId).then(() => RNFS.resumeDownload(jobId)),
    begin: beginCallback,
    progress: progressCallback,
  })

  const response = await promise
  await RNFS.completeHandlerIOS(jobId)

  return {
    response,
    signature,
  }
}

/**
 * Returns local cached image if file exists;
 * Download file and stores into local cache if not
 */
export const handleImage = async ({ source, progressCallback, beginCallback }) => {
  const signature = generateSignature(source)
  const hasImage = await checkImage(signature)

  if (hasImage) {
    return signature.path
  }

  await fetchImage({ signature, progressCallback, beginCallback })
  return signature.path
}

/**
 * async priorityQueue worker, tasks are assigned a priority and completed in ascending priority order
 * 3 concurrent workers will be executed in parallel
 */
const queue = priorityQueue(async (task, callback) => {
  try {
    const response = await handleImage({
      source: task.source,
      progressCallback: task.progressCallback,
      beginCallback: task.beginCallback,
    })
    callback(null, response)
  } catch (error) {
    callback(error, task.source)
  }
}, 3)

/**
 * 
 */
export const queueImage = async (
  callback,
  progressCallback,
  beginCallback,
  source,
  priority
) => {
  queue.push({
    source,
    priority,
    progressCallback,
    beginCallback,
  }, priority, callback)
}
  