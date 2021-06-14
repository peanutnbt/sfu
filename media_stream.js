let media_stream = new Map()

media_stream.addStream = (stream) => {
    media_stream.set(stream?.id, stream);
}

media_stream.removeStream = (stream) => {
    media_stream.delete(stream?.id)
}

media_stream.getStream = (stream_id) => {
    return media_stream.get(stream_id)
}

media_stream.getStreams = () => {
    return media_stream
}

module.exports = media_stream